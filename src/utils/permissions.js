// src/utils/permission.js

/**
 * Helper untuk cek owner/admin yang JID-aware.
 * Baileys bisa return sender sebagai:
 *   - 628xxx@s.whatsapp.net        (format standar)
 *   - 628xxx@lid                   (format linked device)
 *   - 628xxx:device@s.whatsapp.net (multi-device)
 */

/**
 * Normalize JID / nomor telepon jadi digit saja.
 * Semua format Baileys → angka bersih untuk dibandingkan.
 * 
 * @param {string} jid - Jabber ID dari Baileys
 * @returns {string} Nomor bersih (hanya angka)
 */
export function normalizeNumber(jid = '') {
    // Validasi tipe data untuk mencegah error replace pada null/undefined
    if (typeof jid !== 'string') return '';

    return jid
        .replace(/@.+$/, '')           // Hapus @s.whatsapp.net / @lid / @g.us
        .replace(/:\d+$/, '')          // Hapus :device suffix
        .replace(/[^0-9]/g, '');       // Hapus semua karakter non-digit
}

/**
 * Cek apakah sender adalah owner bot.
 * Support semua format JID Baileys.
 * 
 * @param {string} sender - JID pengirim pesan
 * @returns {boolean} True jika sender adalah owner
 */
export function isOwner(sender) {
    const ownerRaw = process.env.OWNER_NUMBER ?? '';
    const ownerNorm = normalizeNumber(ownerRaw);
    const senderNorm = normalizeNumber(sender);

    // Cegah false positive jika ENV kosong
    if (!ownerNorm || !senderNorm) return false;

    return senderNorm === ownerNorm;
}

/**
 * Cek apakah sender adalah admin grup.
 * groupMetadata harus di-fetch sebelum dipanggil.
 * 
 * @param {string} sender - JID pengirim pesan
 * @param {object} groupMetadata - Objek metadata grup dari Baileys
 * @returns {boolean} True jika sender adalah admin atau superadmin
 */
export function isGroupAdmin(sender, groupMetadata) {
    if (!groupMetadata?.participants) return false;

    const senderNorm = normalizeNumber(sender);

    return groupMetadata.participants.some(p => {
        const pNorm = normalizeNumber(p.id);
        return pNorm === senderNorm && (p.admin === 'admin' || p.admin === 'superadmin');
    });
}