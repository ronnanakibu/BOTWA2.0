// src/middleware/antispam.js
const msgCount = new Map()

export function antispam(ctx, next) {
    const jid = ctx.sender
    const now = Date.now()
    const entry = msgCount.get(jid) ?? { count: 0, window: now }

    if (now - entry.window > 10_000) {
        msgCount.set(jid, { count: 1, window: now })
        return next()
    }

    entry.count++
    if (entry.count > 5) {
        // Soft block — ignore message, optionally warn
        return
    }

    return next()
}