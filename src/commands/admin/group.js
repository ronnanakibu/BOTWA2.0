// src/commands/admin/group.js
// Admin grup commands: add, kick, mute, unmute, grouplink, promote, demote
// Semua butuh bot jadi admin grup

import { isBotAdmin, isGroupAdmin, isOwner, normalizeJid } from '../../middleware/permission.js'
import { botLogger } from '../../utils/logger.js'

// ─────────────────────────────────────────────
// HELPER: parse nomor dari mention atau teks
// Input: "@628xxx" atau "628xxx" atau mention JID array
// ─────────────────────────────────────────────

function parseTargetJid(args, mentionedJids = []) {
    // Kalau ada mention, ambil yang pertama
    if (mentionedJids.length) {
        return normalizeJid(mentionedJids[0])
    }

    // Dari args: bisa "628xxx", "08xxx", "+62xxx"
    const raw = args[0]?.replace(/[^0-9]/g, '') ?? ''
    if (!raw) return null

    // Normalisasi: 08xxx → 628xxx
    const normalized = raw.startsWith('0') ? '62' + raw.slice(1) : raw
    return normalized + '@s.whatsapp.net'
}

// ─────────────────────────────────────────────
// GUARD: cek bot admin dan grup
// ─────────────────────────────────────────────

async function guardGroup(ctx) {
    const { isGroup, chatId, sock, reply } = ctx

    if (!isGroup) {
        await reply('🚫 Command ini hanya untuk grup.')
        return false
    }

    const botIsAdmin = await isBotAdmin(sock, chatId)
    if (!botIsAdmin) {
        await reply('🚫 Bot harus jadi *admin grup* dulu baru bisa jalanin command ini.\nMinta admin untuk promote bot.')
        return false
    }

    return true
}

// ─────────────────────────────────────────────
// COMMAND OBJECT
// ─────────────────────────────────────────────

export default {
    name: 'add',
    aliases: [
        'kick', 'remove',
        'mute', 'unmute', 'closechat', 'openchat',
        'grouplink', 'invitelink', 'link',
        'promote', 'demote',
        'kick-me', 'kickme',
        'groupinfo', 'ginfo',
        'listadmin',
    ],
    category: 'admin',
    description: 'Kelola anggota & pengaturan grup.',
    usage: '!add | !kick | !mute | !unmute | !grouplink | !promote | !demote',
    cooldown: 3,
    permissions: ['admin'],

    async execute(ctx) {
        const { args, reply, react, sender, chatId, sock, msg, messageContent } = ctx
        const commandName = ctx.commandName?.toLowerCase()
        const mentionedJids = messageContent?.extendedTextMessage?.contextInfo?.mentionedJid ?? []

        botLogger.admin(commandName, chatId, sender)

        // ─────────────────────────────────────────────
        // !grouplink / !link / !invitelink
        // ─────────────────────────────────────────────

        if (['grouplink', 'link', 'invitelink'].includes(commandName)) {
            if (!ctx.isGroup) return reply('🚫 Hanya untuk grup.')

            const botIsAdmin = await isBotAdmin(sock, chatId)
            if (!botIsAdmin) return reply('🚫 Bot harus jadi admin untuk ambil link grup.')

            try {
                botLogger.debug('admin', `Fetching group invite link for ${chatId}`)
                const code = await sock.groupInviteCode(chatId)
                const link = `https://chat.whatsapp.com/${code}`

                botLogger.info('admin', `Group link fetched: ${link}`)
                await react('🔗')
                return reply(`🔗 *Link Grup*\n\n${link}\n\n_Link ini bisa di-revoke dengan !revokelink_`)
            } catch (err) {
                botLogger.err('admin', err, 'grouplink')
                return reply(`❌ Gagal ambil link grup.\nError: ${err.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !groupinfo / !ginfo
        // ─────────────────────────────────────────────

        if (['groupinfo', 'ginfo'].includes(commandName)) {
            if (!ctx.isGroup) return reply('🚫 Hanya untuk grup.')

            try {
                botLogger.debug('admin', `Fetching group metadata for ${chatId}`)
                const meta = await sock.groupMetadata(chatId)

                const admins = meta.participants.filter(p => p.admin)
                const members = meta.participants.length
                const adminList = admins.map(a => `  • @${a.id.split('@')[0]}`).join('\n')
                const created = new Date(meta.creation * 1000).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                })

                botLogger.info('admin', `Group info fetched: ${meta.subject} (${members} members)`)

                return reply(
                    `📋 *Info Grup*\n\n` +
                    `👥 *Nama:* ${meta.subject}\n` +
                    `📝 *Deskripsi:* ${meta.desc ?? '(tidak ada)'}\n` +
                    `👤 *Anggota:* ${members} orang\n` +
                    `👑 *Admin (${admins.length}):*\n${adminList}\n` +
                    `📅 *Dibuat:* ${created}`
                )
            } catch (err) {
                botLogger.err('admin', err, 'groupinfo')
                return reply(`❌ Gagal ambil info grup: ${err.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !listadmin
        // ─────────────────────────────────────────────

        if (commandName === 'listadmin') {
            if (!ctx.isGroup) return reply('🚫 Hanya untuk grup.')

            try {
                const meta = await sock.groupMetadata(chatId)
                const admins = meta.participants.filter(p => p.admin)

                if (!admins.length) return reply('Tidak ada admin di grup ini.')

                const list = admins.map((a, i) => {
                    const tag = a.admin === 'superadmin' ? '👑' : '⭐'
                    return `${i + 1}. ${tag} @${a.id.split('@')[0]}`
                }).join('\n')

                return reply(`👑 *Daftar Admin (${admins.length}):*\n\n${list}`)
            } catch (err) {
                botLogger.err('admin', err, 'listadmin')
                return reply(`❌ Gagal: ${err.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !mute / !closechat — tutup grup (hanya admin yang bisa kirim)
        // !unmute / !openchat — buka grup
        // ─────────────────────────────────────────────

        if (['mute', 'closechat'].includes(commandName)) {
            if (!await guardGroup(ctx)) return

            try {
                botLogger.debug('admin', `Muting group ${chatId}`)
                await sock.groupSettingUpdate(chatId, 'announcement')
                botLogger.info('admin', `Group muted: ${chatId}`)
                await react('🔇')
                return reply('🔇 *Grup dikunci.*\nHanya admin yang bisa kirim pesan sekarang.')
            } catch (err) {
                botLogger.err('admin', err, 'mute')
                return reply(`❌ Gagal kunci grup: ${err.message}`)
            }
        }

        if (['unmute', 'openchat'].includes(commandName)) {
            if (!await guardGroup(ctx)) return

            try {
                botLogger.debug('admin', `Unmuting group ${chatId}`)
                await sock.groupSettingUpdate(chatId, 'not_announcement')
                botLogger.info('admin', `Group unmuted: ${chatId}`)
                await react('🔊')
                return reply('🔊 *Grup dibuka.*\nSemua anggota bisa kirim pesan lagi.')
            } catch (err) {
                botLogger.err('admin', err, 'unmute')
                return reply(`❌ Gagal buka grup: ${err.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !add — tambah anggota ke grup
        // ─────────────────────────────────────────────

        if (commandName === 'add') {
            if (!await guardGroup(ctx)) return

            const targetJid = parseTargetJid(args, mentionedJids)
            if (!targetJid) {
                return reply(
                    `❌ Kasih nomor yang mau ditambah.\n\n` +
                    `*!add 628xxxxxxxxxx*\natau tag orangnya: *!add @nomor*`
                )
            }

            try {
                botLogger.debug('admin', `Adding ${targetJid} to ${chatId}`)
                const result = await sock.groupParticipantsUpdate(chatId, [targetJid], 'add')
                const status = result?.[0]?.status

                botLogger.info('admin', `Add result: ${status} for ${targetJid}`)

                // Status code dari Baileys
                const statusMsg = {
                    '200': `✅ *@${targetJid.split('@')[0]}* berhasil ditambahkan.`,
                    '403': `❌ @${targetJid.split('@')[0]} tidak mengizinkan ditambahkan ke grup.`,
                    '404': `❌ Nomor @${targetJid.split('@')[0]} tidak terdaftar di WhatsApp.`,
                    '408': `❌ @${targetJid.split('@')[0]} sudah pernah diundang, tunggu undangan diterima.`,
                    '409': `⚠️ @${targetJid.split('@')[0]} sudah ada di grup.`,
                    '500': `❌ Gagal menambahkan. Internal error.`,
                }

                await react(status === '200' ? '✅' : '❌')
                return reply(statusMsg[status] ?? `Status: ${status}`)

            } catch (err) {
                botLogger.err('admin', err, 'add')
                return reply(`❌ Gagal tambah anggota: ${err.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !kick / !remove — keluarkan anggota
        // ─────────────────────────────────────────────

        if (['kick', 'remove'].includes(commandName)) {
            if (!await guardGroup(ctx)) return

            const targetJid = parseTargetJid(args, mentionedJids)
            if (!targetJid) {
                return reply(`❌ Tag atau masukkan nomor yang mau dikick.\n*!kick @nomor*`)
            }

            // Jangan kick owner bot atau diri sendiri
            const botJid = normalizeJid(sock.user?.id ?? '')
            if (targetJid === botJid) return reply(`❌ Tidak bisa kick bot sendiri 😅`)

            if (isOwner(targetJid)) {
                return reply(`❌ Tidak bisa kick owner bot.`)
            }

            // Cek kalau target adalah admin
            const targetIsAdmin = await isGroupAdmin(sock, chatId, targetJid)
            const senderIsOwner = isOwner(sender)
            if (targetIsAdmin && !senderIsOwner) {
                return reply(`❌ Tidak bisa kick admin grup. Demote dulu.`)
            }

            try {
                botLogger.debug('admin', `Kicking ${targetJid} from ${chatId}`)
                await sock.groupParticipantsUpdate(chatId, [targetJid], 'remove')
                botLogger.info('admin', `Kicked ${targetJid} from ${chatId}`)
                await react('👢')
                return reply(`👢 *@${targetJid.split('@')[0]}* telah dikeluarkan dari grup.`)
            } catch (err) {
                botLogger.err('admin', err, 'kick')
                return reply(`❌ Gagal kick: ${err.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !kickme — user minta keluar sendiri
        // ─────────────────────────────────────────────

        if (['kick-me', 'kickme'].includes(commandName)) {
            if (!await guardGroup(ctx)) return

            // Jangan izinkan owner kick dirinya sendiri dari grup
            if (isOwner(sender)) return reply(`😅 Owner ga perlu kickme, keluar manual aja cuy.`)

            try {
                botLogger.debug('admin', `Self-kick: ${sender} from ${chatId}`)
                await sock.groupParticipantsUpdate(chatId, [sender], 'remove')
                botLogger.info('admin', `Self-kicked: ${sender}`)
            } catch (err) {
                botLogger.err('admin', err, 'kickme')
                return reply(`❌ Gagal: ${err.message}`)
            }
            return
        }

        // ─────────────────────────────────────────────
        // !promote — jadikan admin
        // ─────────────────────────────────────────────

        if (commandName === 'promote') {
            if (!await guardGroup(ctx)) return

            const targetJid = parseTargetJid(args, mentionedJids)
            if (!targetJid) return reply(`❌ Tag orang yang mau dipromote.\n*!promote @nomor*`)

            try {
                botLogger.debug('admin', `Promoting ${targetJid} in ${chatId}`)
                await sock.groupParticipantsUpdate(chatId, [targetJid], 'promote')
                botLogger.info('admin', `Promoted ${targetJid} in ${chatId}`)
                await react('⭐')
                return reply(`⭐ *@${targetJid.split('@')[0]}* sekarang jadi admin grup.`)
            } catch (err) {
                botLogger.err('admin', err, 'promote')
                return reply(`❌ Gagal promote: ${err.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !demote — cabut admin
        // ─────────────────────────────────────────────

        if (commandName === 'demote') {
            if (!await guardGroup(ctx)) return

            const targetJid = parseTargetJid(args, mentionedJids)
            if (!targetJid) return reply(`❌ Tag orang yang mau di-demote.\n*!demote @nomor*`)

            if (isOwner(targetJid)) return reply(`❌ Tidak bisa demote owner bot.`)

            try {
                botLogger.debug('admin', `Demoting ${targetJid} in ${chatId}`)
                await sock.groupParticipantsUpdate(chatId, [targetJid], 'demote')
                botLogger.info('admin', `Demoted ${targetJid} in ${chatId}`)
                await react('🔽')
                return reply(`🔽 *@${targetJid.split('@')[0]}* dicopot dari admin grup.`)
            } catch (err) {
                botLogger.err('admin', err, 'demote')
                return reply(`❌ Gagal demote: ${err.message}`)
            }
        }

        // ─── Help fallback ────────────────────────────
        return reply(
            `👑 *Admin Commands*\n\n` +
            `*!add 628xxx* — Tambah anggota\n` +
            `*!kick @user* — Keluarkan anggota\n` +
            `*!kickme* — Keluar sendiri dari grup\n` +
            `*!mute* — Kunci grup (hanya admin)\n` +
            `*!unmute* — Buka grup\n` +
            `*!promote @user* — Jadikan admin\n` +
            `*!demote @user* — Copot admin\n` +
            `*!grouplink* — Ambil link undangan\n` +
            `*!groupinfo* — Info & daftar anggota\n` +
            `*!listadmin* — Daftar admin\n\n` +
            `_Semua command butuh bot jadi admin grup_`
        )
    }
}