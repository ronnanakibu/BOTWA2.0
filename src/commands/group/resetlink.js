// src/commands/group/resetlink.js
// !resetlink — Generate ulang link invite (invalidate link lama)
// Berguna ketika link lama tersebar ke orang yang tidak diinginkan

import { groupGuard } from '../../middleware/groupGuard.js'

export default {
    name: 'resetlink',
    aliases: ['newlink', 'revokelink', 'gantilink'],
    category: 'group',
    description: '[ADMIN] Reset/generate ulang link invite grup.',
    usage: '!resetlink',
    cooldown: 30,
    permissions: ['admin'],

    async execute(ctx) {
        const { reply, react, sock, chatId } = ctx

        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        try {
            await react('⏳')
            await sock.groupRevokeInvite(chatId)
            const newCode = await sock.groupInviteCode(chatId)
            await react('✅')
            await reply(
                `🔄 *Link invite berhasil direset!*\n\n` +
                `🔗 *Link baru:*\n` +
                `https://chat.whatsapp.com/${newCode}\n\n` +
                `⚠️ _Link lama sudah tidak berlaku._`
            )
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal reset link: ${err.message}`)
        }
    }
}