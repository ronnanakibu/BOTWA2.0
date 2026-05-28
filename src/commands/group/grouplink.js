// src/commands/group/grouplink.js
// !grouplink — Ambil link invite grup
// Alias: !link, !invitelink

import { groupGuard } from '../../middleware/groupGuard.js'

export default {
    name: 'grouplink',
    aliases: ['link', 'invitelink', 'gruplink'],
    category: 'group',
    description: '[ADMIN] Ambil link invite grup.',
    usage: '!grouplink',
    cooldown: 10,
    permissions: ['admin'],

    async execute(ctx) {
        const { reply, react, sock, chatId } = ctx

        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        try {
            await react('⏳')
            const code = await sock.groupInviteCode(chatId)
            await react('✅')
            await reply(
                `🔗 *Link Invite Grup:*\n\n` +
                `https://chat.whatsapp.com/${code}\n\n` +
                `_Gunakan !resetlink untuk generate link baru_`
            )
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal ambil link: ${err.message}`)
        }
    }
}