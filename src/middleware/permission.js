// src/middleware/permission.js

import { botLogger } from '../utils/logger.js'

export function normalizeJid(jid = '') {
    return jid.replace(/:\d+@/, '@').trim()
}

function stripJid(jid = '') {
    return jid.replace(/:\d+@.*$/, '').replace(/@.*$/, '').trim()
}

// ─────────────────────────────────────────────
// OWNER CHECK — support @s.whatsapp.net dan @lid
// ─────────────────────────────────────────────

export function isOwner(sender) {
    const ownerRaw = process.env.OWNER_NUMBER ?? ''
    const ownerNumbers = ownerRaw
        .split(',')
        .map(n => n.replace(/[^0-9]/g, '').trim())
        .filter(Boolean)

    const senderNumber = stripJid(sender)
    const senderNormalized = normalizeJid(sender)

    return ownerNumbers.some(ownerNum => {
        return (
            senderNumber === ownerNum ||
            senderNormalized === ownerNum + '@s.whatsapp.net' ||
            senderNormalized === ownerNum + '@lid' ||
            sender.includes(ownerNum)
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
        const jidNorm = normalizeJid(jid)
        const jidNum = stripJid(jid)

        const member = participants.find(p =>
            normalizeJid(p.id) === jidNorm ||
            stripJid(p.id) === jidNum
        )

        return member?.admin === 'admin' || member?.admin === 'superadmin'
    } catch (err) {
        botLogger.err('permission', err, 'isGroupAdmin')
        return false
    }
}

// ─────────────────────────────────────────────
// BOT ADMIN CHECK
// FIX: grup WA baru pakai @lid untuk semua participant.
// sock.user.id  = 628xxx:20@s.whatsapp.net  (phone-based)
// sock.user.lid = 188996495921395@lid        (LID bot di grup)
// Harus cek KEDUANYA biar match participant list.
// ─────────────────────────────────────────────

export async function isBotAdmin(sock, groupId) {
    try {
        const meta = await sock.groupMetadata(groupId)
        const participants = meta.participants ?? []

        // Kumpulin semua kemungkinan identitas bot
        const botIdentities = new Set()

        if (sock.user?.id) {
            botIdentities.add(normalizeJid(sock.user.id))   // 628xxx@s.whatsapp.net
            botIdentities.add(stripJid(sock.user.id))        // 628xxx
        }
        if (sock.user?.lid) {
            botIdentities.add(normalizeJid(sock.user.lid))  // 188996xxx@lid  ← FIX UTAMA
            botIdentities.add(stripJid(sock.user.lid))       // 188996xxx
        }

        const member = participants.find(p => {
            const pNorm = normalizeJid(p.id)
            const pNum = stripJid(p.id)
            return botIdentities.has(pNorm) || botIdentities.has(pNum)
        })

        return member?.admin === 'admin' || member?.admin === 'superadmin'
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