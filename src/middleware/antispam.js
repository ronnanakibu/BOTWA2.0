// src/middleware/antispam.js
// Anti-spam: rate limit pesan per sender per window waktu

const msgCount = new Map() // sender → { count, windowStart }

const SPAM_LIMIT = parseInt(process.env.SPAM_LIMIT ?? '5')       // max pesan per window
const SPAM_WINDOW = parseInt(process.env.SPAM_WINDOW ?? '10000') // window dalam ms (10 detik)
const BLOCK_DURATION = parseInt(process.env.SPAM_BLOCK ?? '30000') // blokir 30 detik

const blocked = new Map() // sender → timestamp unblock

/**
 * Cek apakah sender sedang spam.
 * Return true kalau spam (blokir), false kalau aman.
 */
export function isSpamming(sender) {
    const now = Date.now()

    // Cek apakah masih diblokir
    const unblockedAt = blocked.get(sender) ?? 0
    if (now < unblockedAt) return true

    // Update counter
    const entry = msgCount.get(sender) ?? { count: 0, windowStart: now }

    // Reset window kalau sudah lewat
    if (now - entry.windowStart > SPAM_WINDOW) {
        msgCount.set(sender, { count: 1, windowStart: now })
        return false
    }

    entry.count++
    msgCount.set(sender, entry)

    // Kalau melebihi limit — blokir
    if (entry.count > SPAM_LIMIT) {
        blocked.set(sender, now + BLOCK_DURATION)
        msgCount.delete(sender)
        return true
    }

    return false
}

/**
 * Unblock sender secara manual (owner command).
 */
export function unblockSender(sender) {
    blocked.delete(sender)
    msgCount.delete(sender)
}