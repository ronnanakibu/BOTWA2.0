// src/commands/utility/ocr.js
// !ocr — Extract teks dari gambar via Gemini Vision

import { aiService } from '../../services/ai.js'

export default {
    name: 'ocr',
    aliases: ['scan', 'bacagambar', 'extract'],
    category: 'utility',
    description: 'Extract teks dari gambar (foto struk, dokumen, screenshot, dll)',
    usage: '!ocr (kirim/reply gambar)',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { msg, messageContent, type, reply, react, downloadMedia } = ctx

        const hasDirectImage = type === 'imageMessage'
        const quotedMsg = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage
        const isQuotedImage = quotedMsg && Object.keys(quotedMsg)[0] === 'imageMessage'

        if (!hasDirectImage && !isQuotedImage) {
            return reply(
                '📷 Kirim gambar dengan caption *!ocr* atau\n' +
                'reply gambar dengan *!ocr*\n\n' +
                '_Cocok untuk: struk belanja, dokumen, screenshot teks, papan nama, dll_'
            )
        }

        await react('🔍')

        try {
            const targetMsg = hasDirectImage ? msg : { message: quotedMsg, key: msg.key }
            const buffer = await downloadMedia(targetMsg)
            if (!buffer) throw new Error('Gagal download gambar.')

            const result = await aiService.analyzeImage(
                buffer,
                'image/jpeg',
                `Extract SEMUA teks yang ada di gambar ini secara verbatim (persis apa adanya).
Jika ada tabel, pertahankan strukturnya.
Jika tidak ada teks, deskripsikan isi gambar singkat.
Jawab langsung dengan teks hasil ekstraksi, tanpa preamble.`
            )

            await reply(`📄 *Hasil OCR:*\n\n${result.text}`)
            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal OCR: ${err.message}`)
        }
    }
}