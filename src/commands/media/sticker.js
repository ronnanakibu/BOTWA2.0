// src/commands/media/sticker.js
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import mediaService from '../../services/media.js'

export default {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'media',
    description: 'Convert image or video to a clean WhatsApp sticker',
    usage: '!sticker (caption atau reply gambar)',
    cooldown: 5,
    permissions: ['user'],
    async execute(ctx) {
        const { msg, type, reply, replyMedia } = ctx

        // Check 1: Apakah pesan langsung berupa gambar?
        let isImage = type === 'imageMessage'

        // Check 2: Apakah pesan meng-quote (reply) gambar orang lain?
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        let isQuotedImage = quotedMsg && Object.keys(quotedMsg)[0] === 'imageMessage'

        if (!isImage && !isQuotedImage) {
            return reply('⚠️ Kirim gambar dengan caption *!s* atau balas (reply) gambar yang sudah dikirim dengan perintah *!s*, cuy!')
        }

        // Kirim status "loading" biar user gak ngira bot hang
        await reply('⏳ Sedang memproses stiker kamu, tunggu bentar...')

        try {
            // Target pesan yang akan didownload medianya
            const targetMessage = isImage ? msg : { message: quotedMsg, key: msg.key }

            // Download media menggunakan built-in helper Baileys
            const buffer = await downloadMediaMessage(
                targetMessage,
                'buffer',
                {},
                {
                    logger: console,
                    reconnectCount: 3
                }
            )

            // Lempar buffer gambar ke core processing service kita
            const stickerBuffer = await mediaService.toSticker(buffer)

            // Kirim balik ke user berupa tipe Sticker murni
            await replyMedia(stickerBuffer, 'sticker')

        } catch (err) {
            console.error(err)
            await reply('❌ Waduh sorry cuy, gagal bikin stiker. Pastikan file yang kamu kirim gak korup ya!')
        }
    }
}