// src/commands/ai/lihat.js
// !lihat — Vision AI: analisa gambar via Gemini
// Alias: !vision, !analisa, !describe, !ocr
// FIX: download logic untuk direct image DAN quoted image

import { aiService } from '../../services/ai.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

export default {
    name: 'lihat',
    aliases: ['vision', 'analisa', 'describe', 'ocr'],
    category: 'ai',
    description: 'Analisa gambar dengan AI. Kirim foto + caption command.',
    usage: '!lihat [pertanyaan tentang gambar]',
    example: '!lihat apa yang ada di gambar ini?',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, msg, sock, from } = ctx

        // ── 1. Deteksi sumber gambar ──────────────────
        // Cek apakah gambar ada di pesan langsung (dengan caption)
        const directImage = msg.message?.imageMessage ?? null

        // Cek apakah gambar ada di quoted message
        // Handle ephemeral wrapper dulu
        const rawQuoted =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
            ?? null

        // Unwrap ephemeral/viewonce dari quoted juga
        let quotedInner = rawQuoted
        const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']
        if (rawQuoted) {
            const qType = Object.keys(rawQuoted)[0]
            if (WRAPPERS.includes(qType)) {
                quotedInner = rawQuoted[qType]?.message ?? rawQuoted
            }
        }
        const quotedImage = quotedInner?.imageMessage ?? null

        // Tentukan target message untuk download
        const hasDirectImage = !!directImage
        const hasQuotedImage = !!quotedImage

        if (!hasDirectImage && !hasQuotedImage) {
            return reply(
                `👁️ *Cara pakai:*\n\n` +
                `1. Kirim gambar dengan caption *!lihat*\n` +
                `2. Reply ke foto dengan *!lihat [pertanyaan]*\n\n` +
                `Contoh pertanyaan:\n` +
                `• !lihat apa isi gambar ini?\n` +
                `• !lihat ada teks apa di foto ini?\n` +
                `• !lihat deskripsikan gambar ini`
            )
        }

        await react('👁️')

        try {
            let imageBuffer = null

            if (hasDirectImage) {
                // Gambar langsung di pesan ini
                imageBuffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    { logger: console, reuploadRequest: sock.updateMediaMessage }
                )
            } else {
                // Gambar di quoted message — harus rebuild message object
                // yang kompatibel dengan downloadMediaMessage
                const quotedKey = msg.message?.extendedTextMessage?.contextInfo
                const quotedMsg = {
                    key: {
                        remoteJid: from,
                        id: quotedKey?.stanzaId ?? '',
                        fromMe: quotedKey?.participant === sock.user?.id,
                    },
                    message: quotedInner,
                }
                imageBuffer = await downloadMediaMessage(
                    quotedMsg,
                    'buffer',
                    {},
                    { logger: console, reuploadRequest: sock.updateMediaMessage }
                )
            }

            if (!imageBuffer || imageBuffer.length < 100) {
                throw new Error('Buffer gambar kosong atau rusak.')
            }

            // ── 2. Tentukan prompt ─────────────────────
            const userPrompt = args.length > 0
                ? args.join(' ')
                : 'Deskripsikan gambar ini secara detail dan lengkap. Sebutkan semua yang kamu lihat: objek, teks, warna, suasana, dll.'

            // ── 3. Kirim ke Gemini Vision ──────────────
            const result = await aiService.analyzeImage(imageBuffer, 'image/jpeg', userPrompt)

            await reply(result.text)
            await react('✅')

        } catch (err) {
            await react('❌')
            console.error('[lihat] Error:', err.message)

            // Error message yang lebih informatif
            if (err.message.includes('Buffer') || err.message.includes('download')) {
                await reply(
                    `❌ Gagal download gambar.\n\n` +
                    `Coba:\n` +
                    `• Kirim ulang gambarnya\n` +
                    `• Pastikan gambar tidak expired`
                )
            } else {
                await reply(`❌ Gagal analisa gambar: ${err.message}`)
            }
        }
    }
}