// src/commands/group/groupinfo.js
// !groupinfo — Tampilkan info lengkap grup
// Alias: !ginfo, !infogroup, !grup

import { groupGuard } from '../../middleware/groupGuard.js'

function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}

export default {
    name: 'groupinfo',
    aliases: ['ginfo', 'infogroup', 'grupinfo', 'grup'],
    category: 'group',
    description: 'Tampilkan info lengkap grup.',
    usage: '!groupinfo',
    cooldown: 10,
    permissions: ['user'],

    async execute(ctx) {
        const { reply, react, sock, chatId, isGroup } = ctx

        if (!isGroup) {
            return reply('❌ Command ini hanya bisa dipakai di dalam grup.')
        }

        try {
            await react('🔍')

            const meta = await sock.groupMetadata(chatId)

            const admins = meta.participants.filter(p => p.admin)
            const members = meta.participants.filter(p => !p.admin)
            const superAdmin = meta.participants.find(p => p.admin === 'superadmin')

            const botId = (sock.user?.id ?? '').replace(/:\d+@/, '@')
            const botParticipant = meta.participants.find(
                p => p.id.replace(/:\d+@/, '@') === botId
            )
            const botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin'

            // Group settings
            const isLocked = meta.announce     // hanya admin yang bisa kirim
            const isRestricted = meta.restrict    // hanya admin yang bisa edit info grup

            let info = `📊 *Info Grup*\n`
            info += `${'─'.repeat(30)}\n\n`
            info += `📋 *Nama:* ${meta.subject}\n`
            info += `🆔 *ID:* ${chatId.replace('@g.us', '')}\n`
            info += `👥 *Member:* ${meta.participants.length} orang\n`
            info += `  ├ 👑 Admin: ${admins.length}\n`
            info += `  └ 👤 Member: ${members.length}\n\n`

            if (superAdmin) {
                info += `🌟 *Owner:* @${superAdmin.id.replace('@s.whatsapp.net', '')}\n`
            }

            info += `\n⚙️ *Pengaturan:*\n`
            info += `  • Chat: ${isLocked ? '🔒 Hanya Admin' : '🔓 Semua Member'}\n`
            info += `  • Edit Info: ${isRestricted ? '🔒 Hanya Admin' : '🔓 Semua Member'}\n`
            info += `  • Bot Status: ${botIsAdmin ? '🤖 Admin' : '👤 Member'}\n\n`

            info += `📅 *Dibuat:* ${formatDate(meta.creation)}\n`

            if (meta.desc) {
                const desc = meta.desc.slice(0, 200)
                info += `\n📝 *Deskripsi:*\n${desc}${meta.desc.length > 200 ? '...' : ''}\n`
            }

            // Mention admins
            const adminMentions = admins.map(a => `@${a.id.replace('@s.whatsapp.net', '')}`).join(', ')
            if (admins.length) {
                info += `\n👑 *Admin:* ${adminMentions}`
            }

            await reply(info.trim(), {
                mentions: admins.map(a => a.id)
            })
            await react('✅')

        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal ambil info grup: ${err.message}`)
        }
    }
}