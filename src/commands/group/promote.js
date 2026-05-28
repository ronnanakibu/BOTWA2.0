// src/commands/group/promote.js
// !promote — Jadikan member sebagai admin grup
// Alias: !jadiadmin, !admin

import { groupGuard, parseTargetJid } from '../../middleware/groupGuard.js'

export default {
    name: 'promote',
    aliases: ['jadiadmin', 'adminkan', 'admin'],
    category: 'group',
    description: '[ADMIN] Promote member jadi admin grup.',
    usage: '!promote @mention atau !promote [nomor]',
    cooldown: 3,
    permissions: ['admin'],

    async execute(ctx) {
        const { args, reply, react, sock, chatId, msg } = ctx

        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        const targetJid = parseTargetJid(args, msg)
        if (!targetJid) {
            return reply(`❌ Tag atau ketik nomor yang mau di-promote.\nContoh: !promote @628xxx`)
        }

        // Cek apakah sudah admin
        const meta = await sock.groupMetadata(chatId)
        const target = meta.participants.find(
            p => p.id.replace(/:\d+@/, '@') === targetJid.replace(/:\d+@/, '@')
        )

        if (!target) return reply(`❌ Member tidak ditemukan di grup ini.`)
        if (target.admin === 'admin' || target.admin === 'superadmin') {
            return reply(`⚠️ @${targetJid.replace('@s.whatsapp.net', '')} sudah jadi admin.`, {
                mentions: [targetJid]
            })
        }

        try {
            await react('⏳')
            await sock.groupParticipantsUpdate(chatId, [targetJid], 'promote')
            await react('✅')
            await reply(
                `⬆️ *@${targetJid.replace('@s.whatsapp.net', '')}* berhasil dipromote jadi admin!`,
                { mentions: [targetJid] }
            )
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal promote: ${err.message}`)
        }
    }
}