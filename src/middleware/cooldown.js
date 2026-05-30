// src/middleware/cooldown.js
// Per-user per-command cooldown menggunakan Map in-memory

const cooldownMap = new Map() // key: `${sender}::${commandName}` → timestamp expired

/**
 * Cek dan apply cooldown.
 * Return null kalau aman, return sisa detik kalau masih cooldown.
 */
export function checkCooldown(sender, commandName, cooldownSeconds = 3) {
    if (!cooldownSeconds || cooldownSeconds <= 0) return null

    const key = `${sender}::${commandName}`
    const now = Date.now()
    const expiredAt = cooldownMap.get(key) ?? 0

    if (now < expiredAt) {
        // Masih cooldown — return sisa waktu dalam detik
        return Math.ceil((expiredAt - now) / 1000)
    }

    // Set cooldown baru
    cooldownMap.set(key, now + cooldownSeconds * 1000)

    // Auto cleanup entry yang sudah expired biar tidak leak memory
    // Jalankan cleanup sesekali (1% chance per call = roughly every 100 calls)
    if (Math.random() < 0.01) {
        const nowClean = Date.now()
        for (const [k, exp] of cooldownMap.entries()) {
            if (nowClean > exp) cooldownMap.delete(k)
        }
    }

    return null
}

/**
 * Reset cooldown untuk user + command tertentu.
 * Berguna untuk owner bypass atau test.
 */
export function resetCooldown(sender, commandName) {
    cooldownMap.delete(`${sender}::${commandName}`)
}