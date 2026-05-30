// src/commands/radio/play.js
// !play — Request lagu ke radio. Support batch request dengan koma.

import { radioService } from '../../services/radio.js'

export default {
    name: 'play',
    aliases: ['request', 'req', 'putar'],
    category: 'radio',
    description: 'Request lagu ke radio. Batch: pisahkan dengan koma.',
    usage: '!play [judul/URL]',
    example: '!play Sheila on 7 - Melompat Lebih Tinggi, Peterpan - Ada Apa Denganmu',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sender, from } = ctx
        if (!args.length) return reply(
            `*🎵 Radio Command*\n\n` +
            `*Usage:*\n` +
            `• \`!play [judul lagu]\`\n` +
            `• \`!play [URL YouTube]\`\n` +
            `• \`!play lagu 1, lagu 2, lagu 3\` ← batch\n\n` +
            `_Radio stream: hubungi owner untuk URL stream_`
        )

        const input = args.join(' ')

        // Deteksi batch request — pisah pakai koma
        const queries = input.split(',').map(q => q.trim()).filter(Boolean)
        const isBatch = queries.length > 1

        if (queries.length > 5) return reply('❌ Maksimal 5 lagu per batch request.')

        await react('🔍')

        if (isBatch) {
            await reply(`_Mencari ${queries.length} lagu..._`)
            const results = await radioService.searchBatch(queries, sender)

            let successCount = 0
            let text = `🎵 *Batch Request Result:*\n\n`

            for (const { track, error, query } of results) {
                if (track) {
                    try {
                        radioService.addToQueue(track)
                        text += `✅ *${track.title}* _(${track.durationFormatted})_\n`
                        successCount++
                    } catch (e) {
                        text += `❌ ${query} — ${e.message}\n`
                    }
                } else {
                    text += `❌ *${query}* — ${error}\n`
                }
            }

            text += `\n📋 Queue: ${radioService.queue.length} lagu`
            await reply(text)

            if (successCount > 0 && !radioService.isPlaying) {
                radioService.start().catch(e => console.error('[Radio] Start error:', e.message))
            }

        } else {
            // Single request
            try {
                const track = await radioService.search(queries[0], sender)
                radioService.addToQueue(track)

                await reply(
                    `✅ *Ditambahkan ke queue!*\n\n` +
                    `🎵 *${track.title}*\n` +
                    `⏱️ Durasi: ${track.durationFormatted}\n` +
                    `📋 Posisi: #${radioService.queue.length}`
                )
                await react('✅')

                // Auto-start kalau belum playing
                if (!radioService.isPlaying) {
                    radioService.start().catch(e => console.error('[Radio] Start error:', e.message))
                }

            } catch (err) {
                process.stdout.write(`\x1b[31m[ERROR] [Radio:play] ${err.message}\x1b[0m\n`)
                await react('❌')
                await reply(`❌ Gagal cari lagu: ${err.message}`)
            }
        }
    }
}