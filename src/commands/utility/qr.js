// src/commands/utility/qr.js
// !qr — Generate QR code dari teks/URL

import QRCode from 'qrcode'

export default {
    name: 'qr',
    aliases: ['qrcode', 'buatqr'],
    category: 'utility',
    description: 'Generate QR code dari teks atau URL',
    usage: '!qr [teks/URL]',
    example: '!qr https://github.com/ronnanakibu',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sock, from, msg } = ctx
        if (!args.length) return reply('*Usage:* !qr [teks atau URL]\n\nContoh:\n!qr https://example.com\n!qr Halo dunia!')

        const text = args.join(' ')
        await react('⏳')

        try {
            // Generate QR sebagai PNG buffer
            const buffer = await QRCode.toBuffer(text, {
                type: 'png',
                width: 512,
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' },
                errorCorrectionLevel: 'M'
            })

            await sock.sendMessage(from, {
                image: buffer,
                caption: `🔲 *QR Code*\n\`${text.length > 60 ? text.slice(0, 60) + '...' : text}\``,
                mimetype: 'image/png'
            }, { quoted: msg })

            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal generate QR: ${err.message}`)
        }
    }
}