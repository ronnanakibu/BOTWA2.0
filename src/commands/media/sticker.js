// src/commands/media/sticker.js
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import mediaService from '../../services/media.js'

export default {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'media',
    description: 'Convert image to a clean square-cropped meme sticker with text overlay',
    usage: '/sticker Teks Atas | Teks Bawah',
    cooldown: 5,
    permissions: ['user'],
    async execute(ctx) {
        const { msg, messageContent, type, args, reply, replyMedia } = ctx

        // Cek Apakah pesan berupa gambar langsung atau meng-quote gambar
        let isImage = type === 'imageMessage'
        const quotedMsg = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage

        let finalQuotedMsg = quotedMsg
        if (quotedMsg) {
            const quotedType = Object.keys(quotedMsg)[0]
            const wrapperTypes = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']
            if (wrapperTypes.includes(quotedType)) {
                finalQuotedMsg = quotedMsg[quotedType].message
            }
        }

        let isQuotedImage = finalQuotedMsg && Object.keys(finalQuotedMsg)[0] === 'imageMessage'

        if (!isImage && !isQuotedImage) {
            return reply('⚠️ Mana stiker nya, cuy? 😭\n\nKirim gambar dengan caption atau balas gambar lama dengan perintah */s Teks Atas | Teks Bawah* !')
        }

        await reply('⏳ Sedang di-masak Dik, stiker teks meme lu lagi diproses...')

        try {
            const targetMessage = isImage ? msg : { message: quotedMsg, key: msg.key }

            // Unduh buffer biner media dari server WA
            const buffer = await downloadMediaMessage(
                targetMessage,
                'buffer',
                {},
                {
                    logger: console,
                    reconnectCount: 3
                }
            )

            // 🌟 LOGIKA SPLITTER PARSER: Ambil teks setelah command dan bagi berdasarkan karakter "|"
            const fullText = args.join(' ')
            let topText = ''
            let bottomText = ''

            if (fullText) {
                const parts = fullText.split('|')
                topText = parts[0] ? parts[0].trim() : ''
                bottomText = parts[1] ? parts[1].trim() : ''
            }

            // Oper pengolahan gambar ke Sharp Service
            const stickerBuffer = await mediaService.toMemeSticker(buffer, topText, bottomText)

            // Muntahkan hasilnya dalam wujud stiker berkas WebP
            await replyMedia(stickerBuffer, 'sticker')

        } catch (err) {
            console.error('❌ Meme sticker command error:', err.message)
            await reply('❌ Waduh sorry cuy, gagal total pas meracik stiker teks meme. Pastikan gambarnya aman!')
        }
    }
}