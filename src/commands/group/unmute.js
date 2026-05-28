// src/commands/group/unmute.js
// !unmute — Buka kembali grup yang dikunci
// Alias: !buka, !unlock, !openchat

import { groupGuard } from '../../middleware/groupGuard.js'

export default {
    name: 'unmute',
    aliases: ['buka', 'unlock', 'openchat', 'opengroup'],
    category: 'group',
    description: '[ADMIN] Buka grup — semua member bisa kirim pesan.',
    usage: '!unmute',
    cooldown: 5,
    permissions: ['admin'],

    async execute(ctx) {
        const { reply, react, sock, chatId } = ctx

        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        try {
            await react('⏳')
            // 'not_announcement' = semua member bisa kirim
            await sock.groupSettingUpdate(chatId, 'not_announcement')
            await react('✅')
            await reply(
                `🔓 *Grup dibuka!*\n\n` +
                `Semua member sekarang bisa kirim pesan.\n` +
                `Ketik *!mute* untuk mengunci kembali.`
            )
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal unmute grup: ${err.message}`)
        }
    }
}