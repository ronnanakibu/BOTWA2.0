// src/commands/radio/queue.js
import { radioService } from '../../services/radio.js'

export default {
    name: 'queue',
    aliases: ['q', 'antrian', 'daftar'],
    category: 'radio',
    description: 'Lihat antrian lagu radio',
    usage: '!queue',
    cooldown: 3,
    permissions: ['user'],

    async execute(ctx) {
        const { reply } = ctx
        const current = radioService.currentTrack
        const queue = radioService.queue

        if (!current && queue.length === 0) {
            return reply('📻 Queue kosong. Tambahkan lagu dengan !play [judul]')
        }

        let text = `📻 *Radio Queue* (${radioService.listenerCount} listener)\n\n`

        if (current) {
            text += `▶️ *Now Playing:*\n`
            text += `   ${current.title} _(${current.durationFormatted})_\n\n`
        }

        if (queue.length) {
            text += `📋 *Up Next (${queue.length} lagu):*\n`
            queue.slice(0, 10).forEach((track, i) => {
                text += `${i + 1}. ${track.title} _(${track.durationFormatted})_\n`
            })
            if (queue.length > 10) text += `_...dan ${queue.length - 10} lagu lagi_\n`
        } else {
            text += `📋 Queue kosong setelah lagu ini.`
        }

        await reply(text)
    }
}