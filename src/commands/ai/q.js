// src/commands/ai/q.js
// !q — AI Chat dengan memory
// Alias: !ai, !tanya, !ronnbot

import { aiService } from '../../services/ai.js'
import { memoryService } from '../../services/memory.js'
import { seamlessTracker } from '../../services/seamless.js'

export default {
    name: 'q',
    aliases: ['ai', 'tanya', 'ronnbot'],
    category: 'ai',
    description: 'Chat dengan AI. Bot ingat konteks percakapan.',
    usage: '!q [pertanyaan]',
    example: '!q siapa penemu listrik?',
    cooldown: 3,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, chatId, msg } = ctx

        if (!args.length) {
            return reply(`*Cara pakai:*\n!q [pertanyaan kamu]\n\nContoh:\n!q siapa penemu listrik?\n!q lanjutkan cerita kita\n\nKetik !resetai untuk reset memory obrolan.`)
        }

        const question = args.join(' ')

        // Thinking indicator
        await react('🤔')

        try {
            const result = await aiService.chat(chatId, question)

            const text = result.text
            const sent = await reply(text)

            // Daftarkan ke seamless tracker
            // sent bisa berupa { key: { id: '...' } } tergantung Baileys version
            const sentId = sent?.key?.id
            if (sentId) seamlessTracker.track(sentId)

            await react('✅')

        } catch (err) {
            await react('❌')
            await reply(`Maaf, AI lagi error:\n${err.message}`)
        }
    }
}