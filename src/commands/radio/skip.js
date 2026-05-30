// src/commands/radio/skip.js
import { radioService } from '../../services/radio.js'

export default {
    name: 'skip',
    aliases: ['s', 'next'],
    category: 'radio',
    description: 'Skip lagu yang sedang diputar',
    usage: '!skip',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { reply, react } = ctx
        if (!radioService.isPlaying) return reply('📻 Radio tidak sedang memutar lagu.')

        const skipped = radioService.currentTrack
        await react('⏭️')
        const ok = await radioService.skip()

        if (ok) {
            let text = `⏭️ *Diskip:* ${skipped.title}\n`
            if (radioService.currentTrack) {
                text += `▶️ *Sekarang:* ${radioService.currentTrack.title}`
            } else {
                text += `📋 Queue habis.`
            }
            await reply(text)
        } else {
            await reply('❌ Gagal skip.')
        }
    }
}