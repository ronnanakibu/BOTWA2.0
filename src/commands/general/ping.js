// src/commands/general/ping.js
export default {
    name: 'ping',
    aliases: ['p', 'test'],
    category: 'general',
    description: 'Check bot latency',
    usage: '!ping',
    cooldown: 3,          // seconds
    permissions: ['user'], // 'user' | 'admin' | 'owner'
    async execute(ctx) {
        const start = Date.now()
        await ctx.reply('Pong!')
        // latency bisa dihitung dari ctx.message.messageTimestamp
    }
}