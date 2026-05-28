// src/commands/group/tagall.js
// !tagall — Tag semua member grup sekaligus (mention massal)
// Alias: !everyone, !all, !semuanya

import { groupGuard } from '../../middleware/groupGuard.js'

export default {
    name: 'tagall',
    aliases: ['everyone', 'all', 'semuanya', 'pingall'],
    category: 'group',
    description: '[ADMIN] Tag semua member grup.',
    usage: '!tagall [pesan opsional]',
    example: '!tagall Meeting jam 3 sore hari ini!',
    cooldown: 30, // cooldown panjang untuk mencegah spam
    permissions: ['admin'],

    async execute(ctx) {
        const { args, reply, react, sock, chatId } = ctx

        // Tagall hanya butuh bot admin, sender bisa admin atau owner
        const guard = await groupGuard(ctx, { requireBotAdmin: false, requireSenderAdmin: true })
        if (!guard.ok) return

        try {
            await react('⏳')

            const meta = await sock.groupMetadata(chatId)
            const members = meta.participants.map(p => p.id)
            const groupName = meta.subject ?? 'Grup'

            // Custom message atau default
            const customMsg = args.join(' ').trim()

            // Build mention text
            const mentionText = members
                .map(jid => `@${jid.replace('@s.whatsapp.net', '')}`)
                .join(' ')

            const message = customMsg
                ? `📢 *${customMsg}*\n\n${mentionText}`
                : `📢 *Hai semua!* 👋\n\n${mentionText}`

            await sock.sendMessage(chatId, {
                text: message,
                mentions: members,
            })

            await react('✅')

        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal tagall: ${err.message}`)
        }
    }
}