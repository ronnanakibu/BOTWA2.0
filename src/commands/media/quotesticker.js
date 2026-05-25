// src/commands/media/quotesticker.js
import mediaService from '../../services/media.js'

export default {
    name: 'brat',
    aliases: ['qs', 'qc', 'bratsticker', 'quote'],
    category: 'media',
    description: 'Mengubah teks langsung atau chat kutipan menjadi stiker BRAT hijau neon viral',
    usage: '/brat <teks kamu> atau /brat (reply pesan teks target)',
    cooldown: 3,
    permissions: ['user'],
    async execute(ctx) {
        const { messageContent, args, reply, replyMedia } = ctx

        // 1. Ambil teks langsung dari argumen chat
        let targetText = args.join(' ').trim()

        // 2. Jika teks kosong, fallback ambil dari reply chat orang
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

        if (!targetText) {
            return reply('⚠️ Mana kalimatnya, cuy? 😭\n\nKetik perintah beserta teks seperti */brat teks lu* atau balas chat orang lain pakai perintah */brat*!')
        }

        await reply('⏳ Sedang menyemprotkan cat hijau neon Brat generator...')

        try {
            // 3. Proses teks ke Sharp Service versi Brat
            const bratBuffer = await mediaService.toQuoteSticker(targetText)

            // 4. Kirim hasilnya sebagai stiker
            await replyMedia(bratBuffer, 'sticker')

        } catch (err) {
            console.error('❌ Brat sticker command runtime error:', err.message)
            await reply('❌ Gagal meracik stiker brat, coba cek teksnya lagi cuy!')
        }
    }
}