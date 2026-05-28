// src/middleware/groupGuard.js
// Reusable guard untuk semua group admin commands
// Cek: apakah di grup, apakah bot admin, apakah sender admin/owner

/**
 * Cek apakah JID tertentu adalah admin di grup.
 */
export async function getGroupAdmins(sock, groupId) {
    try {
        const metadata = await sock.groupMetadata(groupId)
        return metadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id)
    } catch {
        return []
    }
}

/**
 * Cek apakah bot adalah admin di grup.
 */
export async function isBotAdmin(sock, groupId) {
    const rawBotId = sock.user?.id ?? ''
    const botJid = rawBotId.replace(/:\d+@/, '@')
    const admins = await getGroupAdmins(sock, groupId)
    return admins.some(a => a.replace(/:\d+@/, '@') === botJid)
}

/**
 * Cek apakah sender adalah admin/superadmin di grup.
 */
export async function isSenderAdmin(sock, groupId, senderJid) {
    const admins = await getGroupAdmins(sock, groupId)
    const normalized = senderJid.replace(/:\d+@/, '@')
    return admins.some(a => a.replace(/:\d+@/, '@') === normalized)
}

/**
 * Cek apakah sender adalah owner bot (dari env).
 */
export function isBotOwner(senderJid) {
    const ownerNumber = process.env.OWNER_NUMBER?.replace(/[^0-9]/g, '')
    if (!ownerNumber) return false
    return senderJid.replace(/[^0-9]/g, '').startsWith(ownerNumber)
}

/**
 * Full group guard — validasi semua kondisi sebelum eksekusi command.
 * Return: { ok: boolean, reason?: string }
 */
export async function groupGuard(ctx, { requireBotAdmin = true, requireSenderAdmin = true } = {}) {
    const { sock, chatId, sender, isGroup, reply } = ctx

    // Harus di grup
    if (!isGroup) {
        await reply('❌ Command ini hanya bisa dipakai di dalam grup.')
        return { ok: false }
    }

    // Cek bot admin kalau diperlukan
    if (requireBotAdmin) {
        const botIsAdmin = await isBotAdmin(sock, chatId)
        if (!botIsAdmin) {
            await reply(
                `❌ *Bot harus jadi admin grup dulu.*\n\n` +
                `Promote bot ke admin, lalu coba lagi.`
            )
            return { ok: false }
        }
    }

    // Cek sender admin (atau owner bisa bypass)
    if (requireSenderAdmin) {
        const isOwner = isBotOwner(sender)
        const isAdmin = await isSenderAdmin(sock, chatId, sender)

        if (!isOwner && !isAdmin) {
            await reply(`❌ Command ini hanya untuk *admin grup*.`)
            return { ok: false }
        }
    }

    return { ok: true }
}

/**
 * Parse @mention atau nomor HP dari args.
 * Mengembalikan JID yang sudah dinormalisasi.
 */
export function parseTargetJid(args, msg) {
    // Cara 1: mention → extracting dari contextInfo
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
    if (mentionedJids.length) {
        return mentionedJids[0]
    }

    // Cara 2: nomor HP dari args (628xxx atau 08xxx)
    const numArg = args.find(a => /^\d{8,15}$/.test(a.replace(/[+\s-]/g, '')))
    if (numArg) {
        const cleaned = numArg.replace(/[+\s-]/g, '')
        const normalized = cleaned.startsWith('0')
            ? '62' + cleaned.slice(1)
            : cleaned
        return `${normalized}@s.whatsapp.net`
    }

    return null
}