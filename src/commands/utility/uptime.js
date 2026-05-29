// src/commands/utility/uptime.js
// !uptime [url] — Cek apakah website up atau down

export default {
    name: 'uptime',
    aliases: ['cekweb', 'isdown', 'checksite'],
    category: 'utility',
    description: 'Cek apakah sebuah website sedang up atau down',
    usage: '!uptime [url]',
    example: '!uptime https://google.com',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react } = ctx
        if (!args.length) return reply('*Usage:* !uptime [url]\n\nContoh:\n!uptime https://google.com\n!uptime discord.com')

        let url = args[0]
        if (!url.startsWith('http')) url = 'https://' + url

        try { new URL(url) } catch {
            return reply('❌ URL tidak valid.')
        }

        await react('🔍')

        const start = Date.now()
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 8000)

            const res = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                redirect: 'follow',
                headers: { 'User-Agent': 'WA-Bot-UptimeCheck/2.0' }
            })
            clearTimeout(timeout)

            const latency = Date.now() - start
            const isUp = res.status < 500

            const statusEmoji = isUp ? '✅' : '❌'
            const latencyEmoji = latency < 500 ? '🟢' : latency < 2000 ? '🟡' : '🔴'

            await reply(
                `${statusEmoji} *Website Status*\n\n` +
                `🌐 URL: ${url}\n` +
                `📊 Status: ${res.status} ${res.statusText}\n` +
                `${latencyEmoji} Latency: ${latency}ms\n` +
                `📋 Kondisi: ${isUp ? '*UP* — Website bisa diakses' : '*DOWN* — Website bermasalah'}`
            )
            await react(isUp ? '✅' : '⚠️')

        } catch (err) {
            const latency = Date.now() - start
            const isTimeout = err.name === 'AbortError'

            await reply(
                `❌ *Website Status*\n\n` +
                `🌐 URL: ${url}\n` +
                `📋 Kondisi: *DOWN*\n` +
                `💬 Error: ${isTimeout ? 'Request timeout (>8s)' : err.message}`
            )
            await react('❌')
        }
    }
}