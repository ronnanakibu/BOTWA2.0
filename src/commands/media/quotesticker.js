// src/commands/media/quotesticker.js
import mediaService from '../../services/media.js'

export default {
    name: 'quotesticker',
    aliases: ['qs', 'qc', 'quote'],
    category: 'media',
    description: 'Mengubah chat teks kutipan menjadi stiker quote estetik',
    usage: '/qs (reply pesan teks target)',
    cooldown: 3,
    permissions: ['user'],
    async execute(ctx) {
        const { messageContent, reply, replyMedia } = ctx

        // 1. Tangkap objek pesan yang sedang di-reply (quoted message)
        const quotedMsg = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage

        // 2. Bongkar jika dibungkus pesan ephemeral / view-once
        let finalQuotedMsg = quotedMsg
        if (quotedMsg) {
            const quotedType = Object.keys(quotedMsg)[0]
            const wrapperTypes = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']
            if (wrapperTypes.includes(quotedType)) {
                finalQuotedMsg = quotedMsg[quotedType].message
            }
        }

        // 3. Ekstrak teks murni dari chat target
        const quotedText = finalQuotedMsg?.conversation || finalQuotedMsg?.extendedTextMessage?.text

        // Validasi: Jika user tidak me-reply pesan teks apa pun
        if (!quotedText) {
            return reply('⚠️ Bejirr, salah target cuy! Perintah ini wajib digunakan dengan cara membalas (reply) ke chat yang isinya *pesan teks murni*!')
        }

        await reply('⏳ Mengabadikan kutipan chat menjadi mahakarya estetik...')

        try {
            // 4. Proses teks biner ke Sharp Service
            const quoteBuffer = await mediaService.toQuoteSticker(quotedText)

            // 5. Tembakkan hasilnya dalam wujud stiker berkas WebP ke WhatsApp
            await replyMedia(quoteBuffer, 'sticker')

        } catch (err) {
            console.error('❌ Quote sticker command runtime error:', err.message)
            await reply('❌ Gagal meracik quote sticker, coba cek teksnya lagi cuy!')
        }
    }
}