// src/commands/radio/np.js — Now Playing
import { radioService } from '../../services/radio.js'

export default {
    name: 'np',
    aliases: ['nowplaying', 'laguapa', 'current'],
    category: 'radio',
    description: 'Info lagu yang sedang diputar',
    usage: '!np',
    cooldown: 3,
    permissions: ['user'],

    async execute(ctx) {
        const { reply, sock, from, msg } = ctx
        const info = radioService.getNowPlayingInfo()

        if (!info) return reply('📻 Radio tidak sedang memutar lagu.\nKetik !play [judul] untuk mulai.')

        const { track, queue, listeners, fx, eq } = info

        const text =
            `🎵 *Now Playing*\n\n` +
            `📀 *${track.title}*\n` +
            `⏱️ Durasi: ${track.durationFormatted}\n` +
            `👥 Listener: ${listeners}\n` +
            `📋 Queue: ${queue} lagu\n` +
            `🎚️ FX: ${fx} | EQ: ${eq}\n\n` +
            `_!queue untuk lihat antrian · !skip untuk skip_`

        if (track.thumbnail) {
            await sock.sendMessage(from, {
                image: { url: track.thumbnail },
                caption: text
            }, { quoted: msg })
        } else {
            await reply(text)
        }
    }
}