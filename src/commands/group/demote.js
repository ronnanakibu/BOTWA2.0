// src/commands/group/demote.js
// !demote — Cabut status admin member
// Alias: !cabutadmin, !unadmin

import { groupGuard, parseTargetJid, isBotOwner } from '../../middleware/groupGuard.js'

export default {
    name: 'demote',
    aliases: ['cabutadmin', 'unadmin', 'deadmin'],
    category: 'group',
    description: '[ADMIN] Cabut status admin member.',
    usage: '!demote @mention atau !demote [nomor]',
    cooldown: 3,
    permissions: ['admin'],

    async execute(ctx) {
        const { args, reply, react, sock, chatId, sender, msg } = ctx

        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        const targetJid = parseTargetJid(args, msg)
        if (!targetJid) {
            return reply(`❌ Tag atau ketik nomor yang mau di-demote.\nContoh: !demote @628xxx`)
        }

        const meta = await sock.groupMetadata(chatId)
        const target = meta.participants.find(
            p => p.id.replace(/:\d+@/, '@') === targetJid.replace(/:\d+@/, '@')
        )

        if (!target) return reply(`❌ Member tidak ditemukan di grup ini.`)

        // Tidak bisa demote superadmin/owner grup
        if (target.admin === 'superadmin') {
            return reply(`❌ Tidak bisa demote owner/superadmin grup.`)
        }

        if (!target.admin) {
            return reply(`⚠️ @${targetJid.replace('@s.whatsapp.net', '')} bukan admin.`, {
                mentions: [targetJid]
            })
        }

        // Proteksi: hanya owner bot yang bisa demote sesama admin
        // (mencegah admin wars)
        const senderAdmin = meta.participants.find(
            p => p.id.replace(/:\d+@/, '@') === sender.replace(/:\d+@/, '@')
        )

        if (senderAdmin?.admin !== 'superadmin' && !isBotOwner(sender)) {
            return reply(`❌ Hanya superadmin/owner grup yang bisa demote admin lain.`)
        }

        try {
            await react('⏳')
            await sock.groupParticipantsUpdate(chatId, [targetJid], 'demote')
            await react('✅')
            await reply(
                `⬇️ *@${targetJid.replace('@s.whatsapp.net', '')}* berhasil di-demote dari admin.`,
                { mentions: [targetJid] }
            )
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal demote: ${err.message}`)
        }
    }
}