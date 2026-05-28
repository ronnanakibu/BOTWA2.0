// src/commands/group/mute.js
// !mute / !unmute — Restrict/unrestrict siapa yang bisa kirim pesan
// Hanya admin yang bisa kirim saat mute aktif
// Alias: !tutup, !buka, !lock, !unlock

import { groupGuard } from '../../middleware/groupGuard.js'

export default {
    name: 'mute',
    aliases: ['tutup', 'lock', 'closechat', 'closedgroup'],
    category: 'group',
    description: '[ADMIN] Kunci grup — hanya admin yang bisa kirim pesan.',
    usage: '!mute',
    cooldown: 5,
    permissions: ['admin'],

    async execute(ctx) {
        const { reply, react, sock, chatId } = ctx

        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        try {
            await react('⏳')
            // 'announcement' = hanya admin yang bisa kirim
            await sock.groupSettingUpdate(chatId, 'announcement')
            await react('✅')
            await reply(
                `🔒 *Grup dikunci!*\n\n` +
                `Hanya admin yang bisa kirim pesan.\n` +
                `Ketik *!unmute* untuk membuka kembali.`
            )
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal mute grup: ${err.message}`)
        }
    }
}