// src/commands/owner/eval.js
// !eval — Owner-only: Jalankan javascript secara dinamis dari WhatsApp

import { isOwner } from '../../utils/permissions.js'
import util from 'util'

export default {
    name: 'eval',
    aliases: ['e', 'ev'],
    category: 'owner',
    description: '[OWNER] Jalankan kode JavaScript dinamis.',
    usage: '!eval [kode]',
    cooldown: 0,
    permissions: ['owner'],

    async execute(ctx) {
        const { args, reply, react, sender, msg, sock, chatId } = ctx

        if (!isOwner(sender)) {
            await react('🚫')
            return
        }

        const code = args.join(' ')
        if (!code) return reply('❌ Kasih kodenya.\nContoh: `!eval 1 + 1`')

        await react('⏳')

        try {
            // Evaluasi kode secara dinamis
            let evaled = eval(code)
            
            // Jika return berupa promise, selesaikan dulu
            if (evaled && typeof evaled.then === 'function') {
                evaled = await evaled
            }

            // Gunakan util.inspect agar object ter-format dengan baik
            let result = typeof evaled !== 'string' ? util.inspect(evaled, { depth: 1 }) : evaled

            await react('✅')
            return reply(`✅ *Output:* \n\`\`\`javascript\n${result}\n\`\`\``)

        } catch (err) {
            await react('❌')
            return reply(`❌ *Error:* \n\`\`\`javascript\n${err.message}\n\`\`\``)
        }
    }
}
