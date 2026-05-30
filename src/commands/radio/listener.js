// src/commands/radio/listener.js
import { radioService } from '../../services/radio.js'

export default {
    name: 'listener',
    aliases: ['listeners', 'pendengar'],
    category: 'radio',
    description: 'Jumlah pendengar radio aktif',
    usage: '!listener',
    cooldown: 3,
    permissions: ['user'],

    async execute(ctx) {
        const { reply } = ctx
        const count = radioService.listenerCount
        const isPlaying = radioService.isPlaying
        const port = process.env.RADIO_PORT ?? '8080'

        await reply(
            `📻 *Radio Status*\n\n` +
            `👥 Pendengar aktif: *${count}*\n` +
            `▶️ Status: ${isPlaying ? '*ON AIR* 🔴' : '*OFF* ⚫'}\n` +
            `🔗 Stream: \`http://[host]:${port}/stream\`\n\n` +
            `_Buka URL stream di media player (VLC, browser, dll)_`
        )
    }
}