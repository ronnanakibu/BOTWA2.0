// src/commands/media/quotesticker.js
import mediaService from '../../services/media.js'

export default {
    name: 'anomali',
    aliases: ['qs', 'qc', 'quote', 'anm'],
    category: 'media',
    description: 'Mengubah teks langsung atau chat kutipan menjadi stiker anomali minimalis reguler font',
    usage: '/anomali <teks kamu> atau /anomali (reply pesan teks target)',
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
            return reply('⚠️ Mana teksnya, cuy? 😭\n\nKetik perintah beserta teks seperti */anomali teks lu* atau balas chat orang lain pakai perintah */anomali*!')
        }

        await reply('⏳ Merender stiker teks anomali minimalis...')

        try {
            // 3. Proses teks ke Sharp Service versi Anomali Tipis murni
            const anomaliBuffer = await mediaService.toQuoteSticker(targetText)

            // 4. Kirim hasilnya sebagai stiker berkas WebP
            await replyMedia(anomaliBuffer, 'sticker')

        } catch (err) {
            console.error('❌ Anomali sticker command runtime error:', err.message)
            await reply('❌ Gagal meracik stiker anomali, coba cek teksnya lagi cuy!')
        }
    }
}