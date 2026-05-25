// src/commands/media/quotesticker.js
import mediaService from '../../services/media.js'

export default {
    name: 'anomali',
    aliases: ['qs', 'qc', 'quote', 'brat'],
    category: 'media',
    description: 'Mengubah teks menjadi stiker anomali kurus tipis ala brat generator',
    usage: '/anomali <teks kamu>',
    cooldown: 3,
    permissions: ['user'],
    async execute(ctx) {
        const { messageContent, args, reply, replyMedia } = ctx

        let targetText = args.join(' ').trim()

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

        await reply('⏳ Merender stiker teks anomali kurus tipis...')

        try {
            const buffer = await mediaService.toQuoteSticker(targetText)
            await replyMedia(buffer, 'sticker')
        } catch (err) {
            console.error('❌ Anomali sticker error:', err.message)
            await reply('❌ Gagal meracik stiker anomali, coba cek teksnya lagi cuy!')
        }
    }
}