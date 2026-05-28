// src/commands/ai/resetai.js
// !resetai — Reset memory AI untuk chat ini

import { memoryService } from '../../services/memory.js'

export default {
    name: 'resetai',
    aliases: ['clearai', 'lupaai'],
    category: 'ai',
    description: 'Reset memory percakapan AI di chat ini.',
    usage: '!resetai',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { reply, react, chatId } = ctx

        memoryService.clearHistory(chatId)
        await react('🗑️')
        await reply(`Memory AI di chat ini sudah direset.\nObrolan selanjutnya mulai dari awal lagi.`)
    }
}