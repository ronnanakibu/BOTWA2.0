// src/commands/ai/fact.js
// !fact — Daily Facts via AI
// Alias: !fakta

import { aiService } from '../../services/ai.js'

const TOPICS = ['sains', 'teknologi', 'sejarah', 'alam', 'psikologi', 'matematika', 'fisika', 'biologi', 'astronomi', 'kimia']

export default {
    name: 'fact',
    aliases: ['fakta', 'facts'],
    category: 'ai',
    description: 'Fakta menarik acak dari berbagai topik.',
    usage: '!fact [topik]',
    example: '!fact astronomi',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react } = ctx

        let topic = args[0]?.toLowerCase() ?? null

        // Validasi topik
        if (topic && !TOPICS.includes(topic)) {
            topic = null // kalau tidak valid, random aja
        }

        await react('🔬')

        try {
            const result = await aiService.getDailyFact(topic)
            await reply(result.text)
            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`Gagal ambil fakta: ${err.message}`)
        }
    }
}