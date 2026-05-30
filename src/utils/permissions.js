// src/utils/permission.js

/**
 * Normalize JID / nomor telepon jadi digit saja.
 * Handle semua format Baileys:
 *   628xxx@s.whatsapp.net
 *   628xxx@lid
 *   628xxx:device@s.whatsapp.net
 */
export function normalizeNumber(jid = '') {
    return jid
        .replace(/@.+$/, '')       // hapus @s.whatsapp.net / @lid / @g.us
        .replace(/:\d+$/, '')      // hapus :device suffix
        .replace(/[^0-9]/g, '')    // hapus semua non-digit
}

/**
 * Cek apakah sender adalah owner bot.
 */
export function isOwner(sender) {
    const ownerNorm = normalizeNumber(process.env.OWNER_NUMBER ?? '')
    const senderNorm = normalizeNumber(sender ?? '')
    if (!ownerNorm || !senderNorm) return false
    return senderNorm === ownerNorm
}

/**
 * Cek apakah sender adalah admin grup.
 */
export function isGroupAdmin(sender, groupMetadata) {
    if (!groupMetadata?.participants) return false
    const senderNorm = normalizeNumber(sender)
    return groupMetadata.participants.some(p => {
        const pNorm = normalizeNumber(p.id)
        return pNorm === senderNorm && (p.admin === 'admin' || p.admin === 'superadmin')
    })
}