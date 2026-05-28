// src/services/ai.js
// Dual AI Engine: Groq (fast) + Gemini (vision, image gen)
// Features: chat memory, model pool rotation, vision, image generation

import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { memoryService } from './memory.js'
import { logger } from '../utils/logger.js'

// ─────────────────────────────────────────────
// CLIENT INIT
// ─────────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// ─────────────────────────────────────────────
// MODEL POOL
// Rotasi otomatis kalau satu model rate-limited
// ─────────────────────────────────────────────

const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
    'mixtral-8x7b-32768',
]

const GEMINI_MODELS = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash',
]

// Track model yang sedang di-cooldown (rate limited)
const modelCooldowns = new Map() // modelName → timestamp when available again

function getAvailableModel(pool) {
    const now = Date.now()
    for (const model of pool) {
        const availableAt = modelCooldowns.get(model) ?? 0
        if (now >= availableAt) return model
    }
    // Semua cooldown — pakai yang paling cepat available
    let earliest = Infinity, pick = pool[0]
    for (const model of pool) {
        const t = modelCooldowns.get(model) ?? 0
        if (t < earliest) { earliest = t; pick = model }
    }
    return pick
}

function setCooldown(model, durationMs = 60_000) {
    modelCooldowns.set(model, Date.now() + durationMs)
    logger.warn(`[AI] Model ${model} cooldown ${durationMs / 1000}s`)
}

// ─────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────

const BOT_NAME = process.env.BOT_NAME ?? 'RonnBot'
const OWNER_NAME = process.env.OWNER_NAME ?? 'Owner'

const SYSTEM_PROMPT = `Kamu adalah ${BOT_NAME}, asisten AI yang cerdas, helpful, dan sedikit nyantai.
Dibuat oleh ${OWNER_NAME}. Kamu berjalan di WhatsApp sebagai bot.

Aturan:
- Jawab dalam bahasa yang sama dengan user (Indonesia/English/campur = ikuti)
- Boleh santai dan sedikit humor, tapi tetap helpful
- Jawaban ringkas untuk pertanyaan simple, detail untuk yang kompleks
- Jangan sebut dirimu sebagai Groq/Gemini/AI model tertentu — kamu adalah ${BOT_NAME}
- Kalau ada konteks percakapan sebelumnya, gunakan untuk jawaban yang lebih relevan`

// ─────────────────────────────────────────────
// GROQ CHAT (primary — paling cepat)
// ─────────────────────────────────────────────

async function groqChat(chatId, userMessage, retryCount = 0) {
    const model = getAvailableModel(GROQ_MODELS)
    const history = memoryService.getHistory(chatId)

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: userMessage }
    ]

    try {
        const res = await groq.chat.completions.create({
            model,
            messages,
            max_tokens: 1024,
            temperature: 0.7,
        })

        const reply = res.choices[0]?.message?.content?.trim()
        if (!reply) throw new Error('Empty response from Groq')

        // Simpan ke memory
        memoryService.addMessage(chatId, 'user', userMessage)
        memoryService.addMessage(chatId, 'assistant', reply)

        return { text: reply, model, provider: 'groq' }

    } catch (err) {
        const isRateLimit = err?.status === 429 || err?.message?.includes('rate')
        const isModelError = err?.status === 400

        if (isRateLimit) {
            setCooldown(model, 90_000)
            if (retryCount < GROQ_MODELS.length) {
                logger.warn(`[AI] Groq rate limit on ${model}, retrying...`)
                return groqChat(chatId, userMessage, retryCount + 1)
            }
        }

        if (isModelError && retryCount < GROQ_MODELS.length) {
            setCooldown(model, 30_000)
            return groqChat(chatId, userMessage, retryCount + 1)
        }

        throw err
    }
}

// ─────────────────────────────────────────────
// GEMINI CHAT (fallback + vision)
// ─────────────────────────────────────────────

async function geminiChat(chatId, userMessage, retryCount = 0) {
    const modelName = getAvailableModel(GEMINI_MODELS)
    const model = genAI.getGenerativeModel({ model: modelName })
    const history = memoryService.getHistory(chatId)

    // Convert history ke format Gemini
    const geminiHistory = history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
    }))

    try {
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                { role: 'model', parts: [{ text: `Siap! Saya ${BOT_NAME}, asisten AI kamu.` }] },
                ...geminiHistory
            ],
            generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
        })

        const result = await chat.sendMessage(userMessage)
        const reply = result.response.text()?.trim()
        if (!reply) throw new Error('Empty response from Gemini')

        memoryService.addMessage(chatId, 'user', userMessage)
        memoryService.addMessage(chatId, 'assistant', reply)

        return { text: reply, model: modelName, provider: 'gemini' }

    } catch (err) {
        const isRateLimit = err?.status === 429
        if (isRateLimit) {
            setCooldown(modelName, 60_000)
            if (retryCount < GEMINI_MODELS.length) {
                return geminiChat(chatId, userMessage, retryCount + 1)
            }
        }
        throw err
    }
}

// ─────────────────────────────────────────────
// VISION AI — Analisa gambar via Gemini
// ─────────────────────────────────────────────

async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', prompt = 'Deskripsikan gambar ini secara detail.') {
    const modelName = getAvailableModel(GEMINI_MODELS)
    const model = genAI.getGenerativeModel({ model: modelName })

    const imagePart = {
        inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType
        }
    }

    try {
        const result = await model.generateContent([prompt, imagePart])
        const reply = result.response.text()?.trim()
        if (!reply) throw new Error('Empty vision response')
        return { text: reply, model: modelName, provider: 'gemini' }
    } catch (err) {
        if (err?.status === 429) setCooldown(modelName, 60_000)
        throw err
    }
}

// ─────────────────────────────────────────────
// IMAGE GENERATION — via Gemini Imagen / fallback prompt
// ─────────────────────────────────────────────

async function generateImage(prompt) {
    // Gemini 2.0 Flash Experimental support image generation
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `Generate an image: ${prompt}` }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })

        for (const part of result.response.candidates[0].content.parts) {
            if (part.inlineData) {
                return {
                    buffer: Buffer.from(part.inlineData.data, 'base64'),
                    mimeType: part.inlineData.mimeType,
                    provider: 'gemini'
                }
            }
        }
        throw new Error('No image in response')
    } catch (err) {
        logger.error('[AI] Image generation failed:', err.message)
        throw new Error('Gagal generate gambar. Coba prompt yang lebih spesifik.')
    }
}

// ─────────────────────────────────────────────
// CODE DEBUGGER
// ─────────────────────────────────────────────

async function debugCode(code, language = 'auto', chatId = null) {
    const isolatedId = chatId ? `__debug__${chatId}` : `__debug__`
    const prompt = `Kamu adalah senior software engineer.
Analisa kode berikut dan berikan:
1. **Bug/Error** yang ditemukan (kalau ada)
2. **Penjelasan** kenapa error terjadi  
3. **Kode yang sudah diperbaiki**
4. **Tips** tambahan kalau relevan

Bahasa: ${language === 'auto' ? 'deteksi otomatis' : language}

\`\`\`
${code}
\`\`\`

Jawab dalam bahasa Indonesia, format rapi dengan markdown.`

    return groqChat(isolatedId, prompt)
}

// ─────────────────────────────────────────────
// DAILY FACTS
// ─────────────────────────────────────────────

async function getDailyFact(topic = null) {
    const topics = [
        'sains', 'teknologi', 'sejarah', 'alam', 'psikologi',
        'matematika', 'fisika', 'biologi', 'astronomi', 'kimia'
    ]
    const picked = topic ?? topics[Math.floor(Math.random() * topics.length)]

    const prompt = `Berikan 1 fakta menarik dan mengejutkan tentang ${picked}.
Format: 
🔬 *Fakta ${picked.charAt(0).toUpperCase() + picked.slice(1)}*
[isi fakta, 2-3 kalimat, informatif dan engaging]

Sumber: [sebutkan sumber/konteks singkat]`

    // Gunakan Groq untuk kecepatan, tanpa memory (standalone)
    const model = getAvailableModel(GROQ_MODELS)
    const res = await groq.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: 'Kamu adalah ensiklopedia yang memberikan fakta menarik dan akurat.' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 256,
        temperature: 0.9,
    })
    return { text: res.choices[0]?.message?.content?.trim(), provider: 'groq', model }
}

// ─────────────────────────────────────────────
// MAIN CHAT — Auto fallback Groq → Gemini
// ─────────────────────────────────────────────

async function chat(chatId, userMessage) {
    // Coba Groq dulu (lebih cepat)
    try {
        return await groqChat(chatId, userMessage)
    } catch (groqErr) {
        logger.warn(`[AI] Groq failed (${groqErr.message}), falling back to Gemini`)
        try {
            return await geminiChat(chatId, userMessage)
        } catch (geminiErr) {
            logger.error('[AI] Both providers failed:', geminiErr.message)
            throw new Error('Semua AI provider sedang sibuk. Coba lagi sebentar.')
        }
    }
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

export const aiService = {
    chat,
    analyzeImage,
    generateImage,
    debugCode,  // sudah handle chatId
    getDailyFact,
    groqChat,
    geminiChat,
}