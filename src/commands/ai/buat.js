// src/commands/ai/buat.js
// !buat — AI Image Generation via Gemini
// Alias: !imagine, !generate, !gen

import { aiService } from '../../services/ai.js'

export default {
    name: 'buat',
    aliases: ['imagine', 'generate', 'gen'],
    category: 'ai',
    description: 'Generate gambar dari deskripsi teks menggunakan AI.',
    usage: '!buat [deskripsi gambar]',
    example: '!buat kucing astronot di bulan, digital art',
    cooldown: 15,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sock, chatId, msg } = ctx

        if (!args.length) {
            return reply(
                `*Cara pakai:*\n!buat [deskripsi gambar]\n\n` +
                `Contoh:\n` +
                `!buat kucing astronot di bulan\n` +
                `!buat landscape futuristik cyberpunk, neon lights\n` +
                `!buat logo minimalis huruf R warna biru`
            )
        }

        const prompt = args.join(' ')
        await react('🎨')
        await reply(`_Lagi generate gambar..._\n> ${prompt}`)

        try {
            const result = await aiService.generateImage(prompt)

            await sock.sendMessage(chatId, {
                image: result.buffer,
                caption: `🎨 *Generated:* ${prompt}`,
                mimetype: result.mimeType ?? 'image/png'
            }, { quoted: msg })

            await react('✅')

        } catch (err) {
            await react('❌')
            await reply(`Gagal generate gambar:\n${err.message}`)
        }
    }
}