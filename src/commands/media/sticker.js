// src/commands/media/sticker.js
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import mediaService from '../../services/media.js'

export default {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'media',
    description: 'Convert image to a clean WhatsApp sticker',
    usage: '!sticker (caption atau reply gambar)',
    cooldown: 5,
    permissions: ['user'],
    async execute(ctx) {
        const { msg, type, reply, replyMedia } = ctx

        // Cek apakah pesan langsung berupa gambar
        let isImage = type === 'imageMessage'

        // Cek apakah pesan berupa balasan (reply) terhadap gambar lain
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        let isQuotedImage = quotedMsg && Object.keys(quotedMsg)[0] === 'imageMessage'

        if (!isImage && !isQuotedImage) {
            return reply('⚠️ Kirim gambar dengan caption *!s* atau balas (reply) gambar yang sudah dikirim dengan perintah *!s*, cuy!')
        }

        // Tampilkan status indikator loading
        await reply('⏳ Sedang memproses stiker kamu, tunggu bentar...')

        try {
            // Tentukan target objek pesan yang akan diunduh medianya
            const targetMessage = isImage ? msg : { message: quotedMsg, key: msg.key }

            // Unduh file media biner dari server WhatsApp menggunakan built-in helper Baileys
            const buffer = await downloadMediaMessage(
                targetMessage,
                'buffer',
                {},
                {
                    logger: console,
                    reconnectCount: 3
                }
            )

            // Konversi buffer gambar murni lewat pengolah Sharp Service kita
            const stickerBuffer = await mediaService.toSticker(buffer)

            // Kirim balik berkas stiker WebP ke chat tujuan menggunakan context helper
            await replyMedia(stickerBuffer, 'sticker')

        } catch (err) {
            console.error(err)
            await reply('❌ Waduh sorry cuy, gagal bikin stiker. Pastikan file yang kamu kirim gak korup ya!')
        }
    }
}