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
        const { msg, messageContent, type, reply, replyMedia } = ctx

        // Cek 1: Apakah pesan langsung berupa gambar?
        let isImage = type === 'imageMessage'

        // Cek 2: Apakah pesan meng-quote (reply) gambar orang lain?
        const quotedMsg = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage

        // Bongkar bungkus pesan quote jika berjenis ephemeral
        let finalQuotedMsg = quotedMsg
        if (quotedMsg) {
            const quotedType = Object.keys(quotedMsg)[0]
            const wrapperTypes = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']
            if (wrapperTypes.includes(quotedType)) {
                finalQuotedMsg = quotedMsg[quotedType].message
            }
        }

        let isQuotedImage = finalQuotedMsg && Object.keys(finalQuotedMsg)[0] === 'imageMessage'

        // Validasi utama penodong media gambar
        if (!isImage && !isQuotedImage) {
            return reply('⚠️ Mana stiker nya, cuy? 😭\n\nKirim gambar dengan caption *!s* atau balas (reply) gambar yang sudah ada pakai perintah *!s*!')
        }

        await reply('⏳ Sedang memproses stiker kamu, tunggu bentar...')

        try {
            const targetMessage = isImage ? msg : { message: quotedMsg, key: msg.key }

            const buffer = await downloadMediaMessage(
                targetMessage,
                'buffer',
                {},
                {
                    logger: console,
                    reconnectCount: 3
                }
            )

            const stickerBuffer = await mediaService.toSticker(buffer)
            await replyMedia(stickerBuffer, 'sticker')

        } catch (err) {
            console.error('❌ Sticker command runtime error:', err.message)
            await reply('❌ Waduh sorry cuy, gagal bikin stiker. Pastikan file gambar aman gak korup!')
        }
    }
}