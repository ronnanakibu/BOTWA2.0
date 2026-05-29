// src/commands/utility/summarize.js
// !summarize [url] — Fetch + summarize artikel dari URL via AI

import { aiService } from '../../services/ai.js'

export default {
    name: 'summarize',
    aliases: ['sum', 'ringkas', 'tldr'],
    category: 'utility',
    description: 'Ringkas artikel dari URL menggunakan AI',
    usage: '!summarize [URL]',
    example: '!summarize https://tekno.kompas.com/artikel-panjang',
    cooldown: 10,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react } = ctx
        if (!args.length) return reply('*Usage:* !summarize [URL artikel]\n\nContoh:\n!summarize https://kompas.com/artikel')

        let url = args[0]
        if (!url.startsWith('http')) url = 'https://' + url
        try { new URL(url) } catch { return reply('❌ URL tidak valid.') }

        await react('⏳')
        await reply('_Sedang mengambil dan meringkas artikel..._')

        try {
            // Fetch konten artikel
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; WA-Bot/2.0)',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                signal: AbortSignal.timeout(10000)
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            let html = await res.text()

            // Ekstrak teks dari HTML — buang tag, ambil konten
            const text = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 4000) // Batas context AI

            if (text.length < 100) throw new Error('Konten artikel tidak bisa diambil atau terlalu pendek.')

            const prompt = `Ringkas artikel berikut dalam Bahasa Indonesia. Format:
📰 *Judul/Topik*
[1 kalimat topik utama]

📌 *Poin Utama*
• [3-5 poin penting]

💡 *Kesimpulan*
[1-2 kalimat kesimpulan]

Artikel:
${text}`

            const result = await aiService.chat('__summarize__', prompt)
            await reply(`${result.text}\n\n🔗 _Sumber: ${url}_`)
            await react('✅')

        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal summarize: ${err.message}`)
        }
    }
}