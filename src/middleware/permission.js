// src/middleware/permission.js
// Cek permission: owner, admin grup, user biasa
// Dipanggil dari message handler sebelum execute command

import { botLogger } from '../utils/logger.js'

// ─────────────────────────────────────────────
// HELPER: Normalize JID
// ─────────────────────────────────────────────

export function normalizeJid(jid = '') {
    return jid.replace(/:\d+@/, '@').trim()
}

// ─────────────────────────────────────────────
// OWNER CHECK
// ─────────────────────────────────────────────

export function isOwner(sender) {
    const ownerRaw = process.env.OWNER_NUMBER ?? ''
    // Support multiple owners: "6281234,6285678"
    const owners = ownerRaw.split(',').map(n =>
        n.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    )
    return owners.includes(normalizeJid(sender))
}

// ─────────────────────────────────────────────
// GROUP ADMIN CHECK
// Butuh metadata grup dari Baileys
// ─────────────────────────────────────────────

export async function isGroupAdmin(sock, groupId, jid) {
    try {
        const meta = await sock.groupMetadata(groupId)
        const participants = meta.participants ?? []
        const member = participants.find(p => normalizeJid(p.id) === normalizeJid(jid))
        return member?.admin === 'admin' || member?.admin === 'superadmin'
    } catch (err) {
        botLogger.err('permission', err, 'isGroupAdmin')
        return false
    }
}

export async function isBotAdmin(sock, groupId) {
    try {
        const botJid = normalizeJid(sock.user?.id ?? '')
        return await isGroupAdmin(sock, groupId, botJid)
    } catch (err) {
        botLogger.err('permission', err, 'isBotAdmin')
        return false
    }
}

// ─────────────────────────────────────────────
// PERMISSION MIDDLEWARE
// Cek apakah user boleh jalankan command
// Return { allowed: bool, reason: string }
// ─────────────────────────────────────────────

export async function checkPermission(ctx, command) {
    const { sender, isGroup, chatId, sock } = ctx
    const requiredPermission = command.permissions?.[0] ?? 'user'

    // 'user' = semua boleh
    if (requiredPermission === 'user') {
        return { allowed: true }
    }

    // 'owner' = hanya owner
    if (requiredPermission === 'owner') {
        if (!isOwner(sender)) {
            botLogger.warn('permission', `BLOCKED owner-cmd "${command.name}" by ${sender}`)
            return { allowed: false, reason: '🚫 Command ini khusus owner.' }
        }
        return { allowed: true }
    }

    // 'admin' = group admin ATAU owner
    if (requiredPermission === 'admin') {
        if (isOwner(sender)) return { allowed: true }

        if (!isGroup) {
            return { allowed: false, reason: '🚫 Command ini hanya bisa dipakai di grup.' }
        }

        const adminCheck = await isGroupAdmin(sock, chatId, sender)
        if (!adminCheck) {
            botLogger.warn('permission', `BLOCKED admin-cmd "${command.name}" by ${sender}`)
            return { allowed: false, reason: '🚫 Command ini khusus admin grup.' }
        }

        return { allowed: true }
    }

    return { allowed: false, reason: '🚫 Permission tidak dikenali.' }
}