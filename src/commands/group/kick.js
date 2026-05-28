// src/commands/group/kick.js
// !kick — Keluarkan member dari grup
// Alias: !remove, !keluarkan, !out

import { groupGuard, parseTargetJid, getGroupAdmins, isBotOwner } from '../../middleware/groupGuard.js'

export default {
    name: 'kick',
    aliases: ['remove', 'keluarkan', 'out', 'k'],
    category: 'group',
    description: '[ADMIN] Keluarkan member dari grup.',
    usage: '!kick @mention atau !kick [nomor]',
    example: '!kick @628xxx atau !kick 628xxxx',
    cooldown: 3,
    permissions: ['admin'],

    async execute(ctx) {
        const { args, reply, react, sock, chatId, sender, msg } = ctx

        // Guard: harus di grup, bot admin, sender admin
        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        // Parse target
        const targetJid = parseTargetJid(args, msg)
        if (!targetJid) {
            return reply(
                `❌ Siapa yang mau di-kick?\n\n` +
                `*Cara pakai:*\n` +
                `• !kick @mention\n` +
                `• !kick 628xxxx\n\n` +
                `_Reply ke pesan member + !kick_`
            )
        }

        // Proteksi: tidak bisa kick diri sendiri
        const normalizedSender = sender.replace(/:\d+@/, '@')
        const normalizedTarget = targetJid.replace(/:\d+@/, '@')
        if (normalizedTarget === normalizedSender) {
            return reply(`❌ Tidak bisa kick diri sendiri.`)
        }

        // Proteksi: tidak bisa kick superadmin/owner grup
        const groupMeta = await sock.groupMetadata(chatId)
        const targetParticipant = groupMeta.participants.find(
            p => p.id.replace(/:\d+@/, '@') === normalizedTarget
        )

        if (!targetParticipant) {
            return reply(`❌ Member tidak ditemukan di grup ini.`)
        }

        if (targetParticipant.admin === 'superadmin') {
            return reply(`❌ Tidak bisa kick owner/superadmin grup.`)
        }

        // Proteksi: tidak bisa kick sesama admin kecuali owner bot
        if (targetParticipant.admin === 'admin' && !isBotOwner(sender)) {
            return reply(`❌ Tidak bisa kick sesama admin. Hanya owner bot yang bisa.`)
        }

        try {
            await react('⏳')
            await sock.groupParticipantsUpdate(chatId, [targetJid], 'remove')

            // Format nomor untuk display
            const displayNum = targetJid.replace('@s.whatsapp.net', '').replace('62', '0')

            await react('✅')
            await reply(`✅ *@${targetJid.replace('@s.whatsapp.net', '')}* berhasil dikeluarkan.`, {
                mentions: [targetJid]
            })

        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal kick: ${err.message}`)
        }
    }
}