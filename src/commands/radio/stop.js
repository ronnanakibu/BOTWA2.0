// src/commands/radio/stop.js
import { radioService } from '../../services/radio.js'

export default {
    name: 'stop',
    aliases: ['radiooff', 'matiin'],
    category: 'radio',
    description: 'Stop radio dan bersihkan queue',
    usage: '!stop',
    cooldown: 5,
    permissions: ['admin'],

    async execute(ctx) {
        const { reply, react } = ctx
        if (!radioService.isPlaying && radioService.queue.length === 0) {
            return reply('📻 Radio sudah off.')
        }
        radioService.stop()
        await react('⏹️')
        await reply('⏹️ Radio dihentikan dan queue dibersihkan.')
    }
}