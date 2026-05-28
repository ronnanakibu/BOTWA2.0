// src/commands/general/help.js
export default {
    name: 'help',
    aliases: ['menu', 'h'],
    category: 'general',
    description: 'Tampilkan semua command yang tersedia',
    usage: '!help [command]',
    cooldown: 3,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply } = ctx
        const { commands } = await import('../../core/loader.js')

        // !help [nama command] — detail satu command
        if (args.length) {
            const cmd = commands.get(args[0].toLowerCase())
            if (!cmd) return reply(`Command *${args[0]}* tidak ditemukan.`)

            return reply(
                `*${cmd.name.toUpperCase()}*\n` +
                `📌 ${cmd.description}\n\n` +
                `*Usage:* ${cmd.usage ?? '—'}\n` +
                `*Aliases:* ${cmd.aliases?.join(', ') ?? '—'}\n` +
                `*Cooldown:* ${cmd.cooldown ?? 0}s\n` +
                `*Category:* ${cmd.category ?? '—'}`
            )
        }

        // Group by category
        const categories = {}
        for (const [, cmd] of commands) {
            if (!cmd.name) continue
            const cat = cmd.category ?? 'misc'
            if (!categories[cat]) categories[cat] = []
            if (!categories[cat].find(c => c.name === cmd.name)) {
                categories[cat].push(cmd)
            }
        }

        const prefix = process.env.BOT_PREFIX ?? '!'
        const botName = process.env.BOT_NAME ?? 'RonnBot'

        let text = `*🤖 ${botName} — Command List*\n`
        text += `Prefix: *${prefix}* | Total: *${Object.values(categories).flat().length}* commands\n`
        text += `Ketik *${prefix}help [command]* untuk detail\n\n`

        const categoryEmoji = { general: '🔧', ai: '🤖', media: '🎨', owner: '👑', group: '👥', misc: '📦' }

        for (const [cat, cmds] of Object.entries(categories)) {
            const emoji = categoryEmoji[cat] ?? '📦'
            text += `${emoji} *${cat.toUpperCase()}*\n`
            text += cmds.map(c => `  • ${prefix}${c.name} — ${c.description}`).join('\n')
            text += '\n\n'
        }

        await reply(text.trim())
    }
}