// src/commands/utility/shortlink.js
// !shortlink — Shorten URL pakai TinyURL API (no API key needed)

export default {
    name: 'shortlink',
    aliases: ['short', 'shorten', 'tinyurl'],
    category: 'utility',
    description: 'Perpendek URL panjang',
    usage: '!shortlink [URL]',
    example: '!shortlink https://github.com/ronnanakibu/BOTWA2.0',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react } = ctx
        if (!args.length) return reply('*Usage:* !shortlink [URL]\n\nContoh:\n!shortlink https://example.com/very/long/path')

        const url = args[0]

        // Validasi URL format
        try { new URL(url) } catch {
            return reply('❌ URL tidak valid. Pastikan diawali https:// atau http://')
        }

        await react('⏳')

        try {
            // TinyURL API — gratis, no API key
            const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const short = await res.text()

            if (!short.startsWith('http')) throw new Error('Invalid response from TinyURL')

            await reply(
                `🔗 *Short Link*\n\n` +
                `*Original:* ${url.length > 60 ? url.slice(0, 60) + '...' : url}\n` +
                `*Short:* ${short}`
            )
            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal shorten URL: ${err.message}`)
        }
    }
}