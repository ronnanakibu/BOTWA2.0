// src/commands/group/groupinfo.js
// !groupinfo — Info lengkap grup
// FIX: format JID display yang benar, handle :0 suffix

import { formatJidForDisplay } from '../../middleware/groupGuard.js'

function formatDate(ts) {
    // ts bisa dalam detik (unix) atau milidetik
    const ms = ts > 1e10 ? ts : ts * 1000
    return new Date(ms).toLocaleString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
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

            // Pisahkan admin dan member
            const admins = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            const members = meta.participants.filter(p => !p.admin)
            const owner = meta.participants.find(p => p.admin === 'superadmin')

            // Cek status bot di grup
            const botJid = (sock.user?.id ?? '').replace(/:\d+@/, '@').toLowerCase()
            const botParticipant = meta.participants.find(
                p => p.id.replace(/:\d+@/, '@').toLowerCase() === botJid
            )
            const botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin'

            // Group settings
            const isLocked = meta.announce  // true = hanya admin yang bisa kirim
            const isRestricted = meta.restrict  // true = hanya admin edit info grup

            // ── Build display ──────────────────────────
            let info = `📊 *Info Grup*\n`
            info += `${'─'.repeat(28)}\n\n`
            info += `📋 *Nama:* ${meta.subject}\n`
            info += `🆔 *ID:* ${chatId.replace('@g.us', '')}\n`
            info += `👥 *Total Member:* ${meta.participants.length} orang\n`
            info += `  ├ 👑 Admin: ${admins.length}\n`
            info += `  └ 👤 Member: ${members.length}\n`

            if (owner) {
                // FIX: pakai formatJidForDisplay untuk handle :0 suffix
                const ownerPhone = formatJidForDisplay(owner.id)
                info += `\n🌟 *Owner:* @${ownerPhone}\n`
            }

            info += `\n⚙️ *Pengaturan:*\n`
            info += `  • Chat: ${isLocked ? '🔒 Hanya Admin' : '🔓 Semua Member'}\n`
            info += `  • Edit Info: ${isRestricted ? '🔒 Hanya Admin' : '🔓 Semua Member'}\n`
            info += `  • Status Bot: ${botIsAdmin ? '🤖 Admin ✅' : '👤 Member (bukan admin)'}\n`

            if (meta.creation) {
                info += `\n📅 *Dibuat:* ${formatDate(meta.creation)}\n`
            }

            if (meta.desc?.trim()) {
                const desc = meta.desc.trim().slice(0, 200)
                info += `\n📝 *Deskripsi:*\n${desc}${meta.desc.length > 200 ? '...' : ''}\n`
            }

            // FIX: format admin list dengan benar
            if (admins.length) {
                const adminList = admins
                    .map(a => `@${formatJidForDisplay(a.id)}`)
                    .join(', ')
                info += `\n👑 *Admin:*\n${adminList}`
            }

            await reply(info.trim(), {
                // mentions pakai JID asli (tidak di-normalize) untuk WA mention rendering
                mentions: admins.map(a => a.id).concat(owner ? [owner.id] : [])
            })
            await react('✅')

        } catch (err) {
            await react('❌')
            console.error('[groupinfo] Error:', err.message)
            await reply(`❌ Gagal ambil info grup: ${err.message}`)
        }
    }
}