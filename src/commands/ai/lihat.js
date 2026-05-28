// src/commands/ai/lihat.js
// !lihat — Vision AI: analisa gambar via Gemini
// Alias: !vision, !analisa, !describe

import { aiService } from '../../services/ai.js'

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
        const { args, reply, react, msg, downloadMedia } = ctx

        // Cek apakah ada gambar — dari pesan langsung atau quoted
        const hasDirectImage = msg.message?.imageMessage
        const hasQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage

        if (!hasDirectImage && !hasQuotedImage) {
            return reply(`Kirim gambar dengan caption *!lihat* atau reply foto dengan *!lihat [pertanyaan]*`)
        }

        await react('👁️')

        try {
            // Download gambar
            const imageBuffer = await downloadMedia(msg)
            if (!imageBuffer) throw new Error('Gagal download gambar.')

            // Tentukan prompt
            const userPrompt = args.length
                ? args.join(' ')
                : 'Deskripsikan gambar ini secara detail. Sebutkan semua yang kamu lihat.'

            const result = await aiService.analyzeImage(imageBuffer, 'image/jpeg', userPrompt)

            await reply(result.text)
            await react('✅')

        } catch (err) {
            await react('❌')
            await reply(`Gagal analisa gambar: ${err.message}`)
        }
    }
}