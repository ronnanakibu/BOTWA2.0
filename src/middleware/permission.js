// src/middleware/permission.js

import { botLogger } from '../utils/logger.js'

// ─────────────────────────────────────────────
// NORMALIZE JID
// Handle: @s.whatsapp.net, @lid, @g.us, :xx@ variants
// ─────────────────────────────────────────────

export function normalizeJid(jid = '') {
    return jid.replace(/:\d+@/, '@').trim()
}

// Ambil nomor murni dari JID (strip semua suffix)
function stripJid(jid = '') {
    return jid.replace(/:\d+@.*$/, '').replace(/@.*$/, '').trim()
}

// ─────────────────────────────────────────────
// OWNER CHECK — support @s.whatsapp.net dan @lid
// ─────────────────────────────────────────────

export function isOwner(sender) {
    const ownerRaw = process.env.OWNER_NUMBER ?? ''

    // Support multiple owners: "6281234,6285678"
    const ownerNumbers = ownerRaw
        .split(',')
        .map(n => n.replace(/[^0-9]/g, '').trim())
        .filter(Boolean)

    const senderNumber = stripJid(sender)
    const senderNormalized = normalizeJid(sender)

    return ownerNumbers.some(ownerNum => {
        const ownerJidS = ownerNum + '@s.whatsapp.net'
        const ownerJidLid = ownerNum + '@lid'

        return (
            senderNumber === ownerNum ||
            senderNormalized === ownerJidS ||
            senderNormalized === ownerJidLid ||
            sender.includes(ownerNum)          // fallback numerik
        )
    })
}

// ─────────────────────────────────────────────
// GROUP ADMIN CHECK
// ─────────────────────────────────────────────

export async function isGroupAdmin(sock, groupId, jid) {
    try {
        const meta = await sock.groupMetadata(groupId)
        const participants = meta.participants ?? []
        const senderNum = stripJid(jid)

        const member = participants.find(p =>
            normalizeJid(p.id) === normalizeJid(jid) ||
            stripJid(p.id) === senderNum
        )

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
// ─────────────────────────────────────────────

export async function checkPermission(ctx, command) {
    const { sender, isGroup, chatId, sock } = ctx
    const requiredPermission = command.permissions?.[0] ?? 'user'

    if (requiredPermission === 'user') return { allowed: true }

    if (requiredPermission === 'owner') {
        if (!isOwner(sender)) {
            botLogger.warn('permission', `BLOCKED owner-cmd "${command.name}" by ${sender}`)
            return { allowed: false, reason: '🚫 Command ini khusus owner.' }
        }
        return { allowed: true }
    }

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