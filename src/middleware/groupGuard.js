// src/middleware/groupGuard.js
// FIXED: JID normalization kedua sisi, isBotAdmin reliable, parseTargetJid lebih robust

import { isGroupAdmin, isOwner } from '../utils/permissions.js'

// ─────────────────────────────────────────────
// JID NORMALIZE — konsisten di seluruh file ini
// Handles: 628xxx:0@s.whatsapp.net → 628xxx@s.whatsapp.net
// ─────────────────────────────────────────────

function normalizeJid(jid = '') {
    if (!jid) return ''
    if (jid.endsWith('@g.us')) return jid // Biarkan JID grup apa adanya

    // Pisahin berdasarkan @ dan : untuk ambil murni nomor HP-nya saja
    const pureNumber = jid.split('@')[0].split(':')[0]
    return `${pureNumber}@s.whatsapp.net`
}

function jidToPhone(jid = '') {
    return normalizeJid(jid)
        .replace('@s.whatsapp.net', '')
        .replace('@g.us', '')
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

/**
 * Ambil semua admin JID dari grup, sudah dinormalisasi.
 */
export async function getGroupAdmins(sock, groupId) {
    try {
        const metadata = await sock.groupMetadata(groupId)
        return metadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => normalizeJid(p.id))
    } catch (err) {
        console.error('[groupGuard] getGroupAdmins error:', err.message)
        return []
    }
}

/**
 * Cek apakah bot adalah admin di grup.
 * FIX: normalize KEDUA sisi sebelum compare.
 */
export async function isBotAdmin(sock, groupId) {
    const botJid = normalizeJid(sock.user?.id ?? '')
    if (!botJid) return false

    try {
        const metadata = await sock.groupMetadata(groupId)
        return metadata.participants.some(p => {
            const isBot = normalizeJid(p.id) === botJid
            const isAdmin = p.admin === 'admin' || p.admin === 'superadmin'
            return isBot && isAdmin
        })
    } catch (err) {
        console.error('[groupGuard] isBotAdmin error:', err.message)
        return false
    }
}

/**
 * Cek apakah sender adalah admin/superadmin di grup.
 * FIX: normalize kedua sisi.
 */
export async function isSenderAdmin(sock, groupId, senderJid) {
    const normalizedSender = normalizeJid(senderJid)
    try {
        const metadata = await sock.groupMetadata(groupId)
        return metadata.participants.some(p => {
            const isMatch = normalizeJid(p.id) === normalizedSender
            const isAdmin = p.admin === 'admin' || p.admin === 'superadmin'
            return isMatch && isAdmin
        })
    } catch (err) {
        console.error('[groupGuard] isSenderAdmin error:', err.message)
        return false
    }
}

/**
 * Cek apakah sender adalah owner bot (dari env OWNER_NUMBER).
 */
export function isBotOwner(senderJid) {
    const ownerRaw = process.env.OWNER_NUMBER ?? ''
    if (!ownerRaw) return false
    // Normalize owner number — support format: 628xxx, 08xxx, +628xxx
    const ownerPhone = ownerRaw
        .replace(/[^0-9]/g, '')
        .replace(/^0/, '62')
    const senderPhone = jidToPhone(senderJid)
    return senderPhone === ownerPhone
}

/**
 * Full group guard — validasi semua kondisi sebelum eksekusi command.
 * FIX: log detail kenapa gagal untuk debugging.
 * Returns: { ok: boolean }
 */
export async function groupGuard(ctx, { requireBotAdmin = true, requireSenderAdmin = true } = {}) {
    const { sock, chatId, sender, isGroup, reply } = ctx

    if (!isGroup) {
        await reply('❌ Command ini hanya bisa dipakai di dalam grup.')
        return { ok: false }
    }

    if (requireBotAdmin) {
        const botIsAdmin = await isBotAdmin(sock, chatId)
        if (!botIsAdmin) {
            // Debug info di console
            const botJid = normalizeJid(sock.user?.id ?? '')
            console.warn(`[groupGuard] Bot bukan admin. botJid=${botJid}, groupId=${chatId}`)
            await reply(
                `❌ *Bot harus jadi admin grup dulu.*\n\n` +
                `Caranya: Buka info grup → Ubah izin bot → Jadikan Admin\n` +
                `Setelah itu coba command ini lagi.`
            )
            return { ok: false }
        }
    }

    if (requireSenderAdmin) {
        const isOwner = isBotOwner(sender)
        const isAdmin = await isSenderAdmin(sock, chatId, sender)

        if (!isOwner && !isAdmin) {
            console.warn(`[groupGuard] Sender bukan admin. sender=${sender}`)
            await reply(`❌ Command ini hanya untuk *admin grup*.`)
            return { ok: false }
        }
    }

    return { ok: true }
}

/**
 * Parse target JID dari mention atau nomor HP di args.
 * FIX: cek lebih banyak path untuk mentionedJid (ephemeral, dll).
 */
export function parseTargetJid(args, msg) {
    // Cara 1: ambil mentionedJid dari semua kemungkinan path
    const mentionedJid =
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        ?? msg.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        ?? null

    if (mentionedJid) return mentionedJid

    // Cara 2: nomor HP dari args teks
    const numArg = args.find(a => /^\+?\d{8,15}$/.test(a.replace(/[\s\-().]/g, '')))
    if (numArg) {
        const cleaned = numArg.replace(/[+\s\-().]/g, '')
        const normalized = cleaned.startsWith('0') ? '62' + cleaned.slice(1) : cleaned
        return `${normalized}@s.whatsapp.net`
    }

    return null
}

/**
 * Format JID jadi nomor yang readable untuk display di pesan.
 * FIX: handle format :0 yang tersisa.
 * 628xxxxxxxxxxxx@s.whatsapp.net → 628xxxxxxxxxxxx
 */
export function formatJidForDisplay(jid = '') {
    return normalizeJid(jid).replace('@s.whatsapp.net', '').replace('@g.us', '')
}