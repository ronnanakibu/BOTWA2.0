// src/commands/media/quotesticker.js
import mediaService from '../../services/media.js'

export default {
    name: 'quotesticker',
    aliases: ['qs', 'qc', 'quote'],
    category: 'media',
    description: 'Mengubah teks langsung atau chat kutipan menjadi stiker quote estetik',
    usage: '/qs <teks kamu> atau /qs (reply pesan teks target)',
    cooldown: 3,
    permissions: ['user'],
    async execute(ctx) {
        const { messageContent, args, reply, replyMedia } = ctx

        // 1. Ambil teks langsung dari argumen chat (jika ada)
        let targetText = args.join(' ').trim()

        // 2. Jika teks langsung kosong, coba ambil dari pesan yang di-reply (quoted message)
        if (!targetText) {
            const quotedMsg = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage

            let finalQuotedMsg = quotedMsg
            if (quotedMsg) {
                const quotedType = Object.keys(quotedMsg)[0]
                const wrapperTypes = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']
                if (wrapperTypes.includes(quotedType)) {
                    finalQuotedMsg = quotedMsg[quotedType].message
                }
            }

            targetText = finalQuotedMsg?.conversation || finalQuotedMsg?.extendedTextMessage?.text
        }

        // 3. Validasi akhir jika dua-duanya ternyata kosong melongpong
        if (!targetText) {
            return reply('⚠️ Mana teksnya, cuy? 😭\n\nKetik langsung perintahnya beserta teks seperti */qs teks kamu* atau balas (reply) chat teks orang lain pakai perintah */qs*!')
        }

        await reply('⏳ Mengabadikan kutipan menjadi mahakarya estetik...')

        try {
            // 4. Proses teks ke Sharp Service
            const quoteBuffer = await mediaService.toQuoteSticker(targetText)

            // 5. Tembakkan hasilnya dalam wujud stiker berkas WebP
            await replyMedia(quoteBuffer, 'sticker')

        } catch (err) {
            console.error('❌ Quote sticker command runtime error:', err.message)
            await reply('❌ Gagal meracik quote sticker, coba cek teksnya lagi cuy!')
        }
    }
}