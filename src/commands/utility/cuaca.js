// src/commands/utility/cuaca.js
// !cuaca — Realtime weather via Open-Meteo (no API key!) + geocoding

export default {
    name: 'cuaca',
    aliases: ['weather', 'weather'],
    category: 'utility',
    description: 'Cek cuaca realtime di kota manapun',
    usage: '!cuaca [kota]',
    example: '!cuaca Medan',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react } = ctx
        if (!args.length) return reply('*Usage:* !cuaca [kota]\n\nContoh:\n!cuaca Medan\n!cuaca Jakarta\n!cuaca Tokyo')

        const city = args.join(' ')
        await react('🌤️')

        try {
            // Step 1: Geocoding — nama kota → koordinat (Open-Meteo Geocoding API, free)
            const geoRes = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`
            )
            const geoData = await geoRes.json()
            const location = geoData?.results?.[0]
            if (!location) return reply(`❌ Kota *${city}* tidak ditemukan. Coba nama yang lebih spesifik.`)

            const { latitude, longitude, name, country, admin1 } = location

            // Step 2: Weather data (Open-Meteo, free, no key)
            const weatherRes = await fetch(
                `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${latitude}&longitude=${longitude}` +
                `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m` +
                `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
                `&timezone=auto&forecast_days=3`
            )
            const w = await weatherRes.json()
            const c = w.current

            // WMO Weather Code → deskripsi + emoji
            const weatherDesc = (code) => {
                if (code === 0) return ['☀️', 'Cerah']
                if (code <= 2) return ['⛅', 'Berawan sebagian']
                if (code === 3) return ['☁️', 'Mendung']
                if (code <= 49) return ['🌫️', 'Berkabut']
                if (code <= 59) return ['🌦️', 'Gerimis']
                if (code <= 69) return ['🌧️', 'Hujan']
                if (code <= 79) return ['🌨️', 'Salju']
                if (code <= 84) return ['🌧️', 'Hujan lebat']
                if (code <= 99) return ['⛈️', 'Badai petir']
                return ['🌡️', 'Tidak diketahui']
            }

            const windDir = (deg) => {
                const dirs = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL']
                return dirs[Math.round(deg / 45) % 8]
            }

            const [emoji, desc] = weatherDesc(c.weather_code)
            const locationStr = [name, admin1, country].filter(Boolean).join(', ')

            let text = `${emoji} *Cuaca ${locationStr}*\n\n`
            text += `🌡️ Suhu: *${c.temperature_2m}°C* (terasa ${c.apparent_temperature}°C)\n`
            text += `💧 Kelembaban: ${c.relative_humidity_2m}%\n`
            text += `🌬️ Angin: ${c.wind_speed_10m} km/h arah ${windDir(c.wind_direction_10m)}\n`
            text += `🌧️ Hujan: ${c.precipitation} mm\n`
            text += `📋 Kondisi: ${desc}\n\n`
            text += `📅 *Prakiraan 3 hari:*\n`

            const days = ['Hari ini', 'Besok', 'Lusa']
            for (let i = 0; i < 3; i++) {
                const [de, dd] = weatherDesc(w.daily.weather_code[i])
                text += `${de} *${days[i]}:* ${w.daily.temperature_2m_min[i]}°–${w.daily.temperature_2m_max[i]}°C, ${dd}`
                if (w.daily.precipitation_sum[i] > 0) text += `, hujan ${w.daily.precipitation_sum[i]}mm`
                text += '\n'
            }

            await reply(text.trim())
            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal ambil data cuaca: ${err.message}`)
        }
    }
}