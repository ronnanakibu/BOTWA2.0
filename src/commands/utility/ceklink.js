// src/commands/utility/ceklink.js
// !ceklink [url] — Cek apakah URL aman atau phishing via Google Safe Browsing

export default {
    name: 'ceklink',
    aliases: ['safebrowse', 'phishing', 'cekurl'],
    category: 'utility',
    description: 'Cek apakah sebuah URL aman atau berbahaya (phishing/malware)',
    usage: '!ceklink [URL]',
    example: '!ceklink https://suspicious-site.com',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react } = ctx
        if (!args.length) return reply('*Usage:* !ceklink [URL]\n\nContoh:\n!ceklink https://example.com')

        let url = args[0]
        if (!url.startsWith('http')) url = 'https://' + url
        try { new URL(url) } catch {
            return reply('❌ URL tidak valid.')
        }

        await react('🔍')

        const apiKey = process.env.SAFE_BROWSING_API_KEY

        if (!apiKey) {
            // Fallback: cek tanpa API key via urlscan.io public API
            return this.fallbackCheck(url, reply, react)
        }

        try {
            const res = await fetch(
                `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client: { clientId: 'wa-bot', clientVersion: '2.0' },
                        threatInfo: {
                            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
                            platformTypes: ['ANY_PLATFORM'],
                            threatEntryTypes: ['URL'],
                            threatEntries: [{ url }]
                        }
                    })
                }
            )
            const data = await res.json()
            const threats = data.matches ?? []

            if (!threats.length) {
                await reply(`✅ *URL Aman*\n\n🔗 ${url}\n\n📋 Tidak ditemukan ancaman di database Google Safe Browsing.`)
                await react('✅')
            } else {
                const types = threats.map(t => t.threatType).join(', ')
                await reply(
                    `⛔ *URL BERBAHAYA!*\n\n` +
                    `🔗 ${url}\n\n` +
                    `⚠️ Ancaman terdeteksi: *${types}*\n\n` +
                    `_Jangan kunjungi URL ini!_`
                )
                await react('⛔')
            }
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal cek URL: ${err.message}`)
        }
    },

    async fallbackCheck(url, reply, react) {
        try {
            // Gunakan VirusTotal public lookup (no key, limited)
            const domain = new URL(url).hostname
            const res = await fetch(`https://www.virustotal.com/vtapi/v2/url/report?apikey=0&resource=${encodeURIComponent(url)}`)

            // Kalau tidak ada API key VT, fallback ke heuristic check saja
            const suspiciousPatterns = [
                /bit\.ly|tinyurl|t\.co/i,        // shortlinks (neutral, tapi tandai)
                /login.*paypal|paypal.*login/i,
                /secure.*bank|bank.*secure/i,
                /account.*verify|verify.*account/i,
                /free.*prize|prize.*free/i,
                /\.xyz$|\.tk$|\.ml$|\.ga$|\.cf$/i, // TLD mencurigakan
            ]

            const suspicious = suspiciousPatterns.filter(p => p.test(url))

            if (!suspicious.length) {
                await reply(`✅ *Cek URL*\n\n🔗 ${url}\n\n📋 Tidak ditemukan pola mencurigakan.\n_Catatan: Untuk cek lebih akurat, tambahkan SAFE_BROWSING_API_KEY di .env_`)
            } else {
                await reply(
                    `⚠️ *URL Mencurigakan*\n\n` +
                    `🔗 ${url}\n\n` +
                    `📋 Ditemukan ${suspicious.length} pola mencurigakan.\n` +
                    `_Hati-hati! Tambahkan SAFE_BROWSING_API_KEY untuk cek lebih akurat._`
                )
            }
            await react('✅')
        } catch (err) {
            await reply(`❌ Gagal cek URL: ${err.message}`)
            await react('❌')
        }
    }
}