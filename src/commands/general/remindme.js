// src/commands/general/remindme.js
// !remindme — Set reminder, bot bakal ping kamu tepat waktu
// Alias: !remind, !ingatkan, !alarm

import Database from 'better-sqlite3'
import path from 'path'

// ─────────────────────────────────────────────
// DB + SCHEMA
// ─────────────────────────────────────────────

const DB_PATH = path.resolve(process.env.DB_PATH ?? './storage/database/main.db')

function getDb() {
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')

    db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_jid    TEXT    NOT NULL,
            chat_id     TEXT    NOT NULL,
            message     TEXT    NOT NULL,
            fire_at     INTEGER NOT NULL,
            fired       INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at, fired);
    `)
    return db
}

// ─────────────────────────────────────────────
// TIME PARSER
// Format yang didukung:
//   10m, 1h, 2h30m, 1d, 1d6h
//   "besok jam 9", "jam 3 sore", "jam 14:30"
//   "5 menit", "2 jam", "1 hari"
// ─────────────────────────────────────────────

function parseDuration(str) {
    str = str.toLowerCase().trim()
    let totalMs = 0

    // Format: 10m / 1h30m / 2d / 1d6h30m
    const shortMatch = str.match(/^((\d+)d)?((\d+)h)?((\d+)m)?$/)
    if (shortMatch && (shortMatch[2] || shortMatch[4] || shortMatch[6])) {
        const d = parseInt(shortMatch[2] ?? 0)
        const h = parseInt(shortMatch[4] ?? 0)
        const m = parseInt(shortMatch[6] ?? 0)
        totalMs = (d * 86400 + h * 3600 + m * 60) * 1000
        if (totalMs > 0) return totalMs
    }

    // Format natural: "5 menit", "2 jam", "1 hari", "3 minggu"
    const naturalMap = [
        { re: /(\d+)\s*(detik|s(?:ec)?)/i, mul: 1000 },
        { re: /(\d+)\s*(menit|min(?:ute)?s?)/i, mul: 60_000 },
        { re: /(\d+)\s*(jam|h(?:ou)?r?s?)/i, mul: 3_600_000 },
        { re: /(\d+)\s*(hari|day?s?)/i, mul: 86_400_000 },
        { re: /(\d+)\s*(minggu|week?s?)/i, mul: 604_800_000 },
    ]
    for (const { re, mul } of naturalMap) {
        const m = str.match(re)
        if (m) totalMs += parseInt(m[1]) * mul
    }
    if (totalMs > 0) return totalMs

    return null
}

function parseAbsoluteTime(str) {
    // "jam 14:30", "jam 9", "jam 3 sore", "jam 10 pagi"
    const jamMatch = str.match(/jam\s+(\d{1,2})(?::(\d{2}))?\s*(pagi|siang|sore|malam)?/i)
    if (jamMatch) {
        let hour = parseInt(jamMatch[1])
        const minute = parseInt(jamMatch[2] ?? 0)
        const period = jamMatch[3]?.toLowerCase()

        if (period === 'sore' || period === 'malam') {
            if (hour < 12) hour += 12
        } else if (period === 'pagi' || period === 'siang') {
            if (hour === 12) hour = 0
        } else {
            // Heuristic: 1-6 = sore/malam
            if (hour >= 1 && hour <= 6) hour += 12
        }

        const now = new Date()
        const target = new Date(now)
        target.setHours(hour, minute, 0, 0)

        // Kalau sudah lewat hari ini, jadikan besok
        if (target <= now) target.setDate(target.getDate() + 1)

        return target.getTime() - now.getTime()
    }

    // "besok jam 9"
    if (str.includes('besok')) {
        const inner = str.replace('besok', '').trim()
        const ms = parseAbsoluteTime(inner) ?? 0
        return 86_400_000 + ms
    }

    return null
}

function parseTime(str) {
    return parseDuration(str) ?? parseAbsoluteTime(str)
}

function formatMs(ms) {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)

    if (d > 0) return `${d} hari ${h % 24 > 0 ? (h % 24) + ' jam' : ''}`
    if (h > 0) return `${h} jam ${m % 60 > 0 ? (m % 60) + ' menit' : ''}`
    if (m > 0) return `${m} menit`
    return `${s} detik`
}

function formatDate(unixTs) {
    return new Date(unixTs * 1000).toLocaleString('id-ID', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit'
    })
}

// ─────────────────────────────────────────────
// SCHEDULER — check setiap 30 detik
// Di-init sekali waktu bot start
// ─────────────────────────────────────────────

let _sock = null
let _schedulerStarted = false

export function initReminderScheduler(sock) {
    if (_schedulerStarted) return
    _schedulerStarted = true
    _sock = sock

    console.log('⏰ [Reminder] Scheduler started.')

    setInterval(async () => {
        try {
            const db = getDb()
            const now = Math.floor(Date.now() / 1000)

            const due = db.prepare(`
                SELECT * FROM reminders
                WHERE fire_at <= ? AND fired = 0
                ORDER BY fire_at ASC
                LIMIT 20
            `).all(now)

            for (const reminder of due) {
                try {
                    await _sock.sendMessage(reminder.chat_id, {
                        text:
                            `⏰ *Reminder!*\n\n` +
                            `📌 ${reminder.message}\n\n` +
                            `_Set: ${formatDate(reminder.created_at)}_`,
                    }, { quoted: null })

                    db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(reminder.id)
                    console.log(`✅ [Reminder] Fired #${reminder.id} → ${reminder.chat_id}`)
                } catch (e) {
                    console.error(`❌ [Reminder] Failed to send #${reminder.id}:`, e.message)
                }
            }
        } catch (e) {
            console.error('❌ [Reminder Scheduler]:', e.message)
        }
    }, 30_000) // check tiap 30 detik
}

// ─────────────────────────────────────────────
// COMMAND
// ─────────────────────────────────────────────

export default {
    name: 'remindme',
    aliases: ['remind', 'ingatkan', 'alarm', 'r'],
    category: 'general',
    description: 'Set reminder — bot bakal ping kamu tepat waktu.',
    usage: '!remindme <waktu> <pesan>',
    example: '!remindme 30m Minum obat | !remindme besok jam 9 Meeting klien',
    cooldown: 2,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sender, chatId, sock } = ctx

        // Init scheduler pakai sock aktif
        initReminderScheduler(sock)

        const db = getDb()
        const sub = args[0]?.toLowerCase()

        // ─── !remindme list ────────────────────────────
        if (!args.length || sub === 'list' || sub === 'ls') {
            const reminders = db.prepare(`
                SELECT * FROM reminders
                WHERE user_jid = ? AND fired = 0
                ORDER BY fire_at ASC
                LIMIT 10
            `).all(sender)

            if (!reminders.length) {
                return reply(
                    `⏰ *Tidak ada reminder aktif.*\n\n` +
                    `Set reminder:\n*!remindme 30m Minum obat*\n*!remindme 2h Meeting*\n*!remindme besok jam 9 Deadline*`
                )
            }

            const list = reminders.map((r, i) => {
                const remaining = (r.fire_at - Math.floor(Date.now() / 1000))
                const eta = remaining > 0 ? `dalam ${formatMs(remaining * 1000)}` : 'segera'
                return `${i + 1}. [#${r.id}] *${r.message}*\n   📅 ${formatDate(r.fire_at)} (${eta})`
            }).join('\n\n')

            return reply(`⏰ *Reminder aktif (${reminders.length}):*\n\n${list}\n\n_Hapus: !remindme delete <id>_`)
        }

        // ─── !remindme delete <id> ─────────────────────
        if (sub === 'delete' || sub === 'del' || sub === 'cancel' || sub === 'hapus') {
            const id = parseInt(args[1])
            if (!id) return reply(`❌ Kasih ID reminder.\nContoh: !remindme delete 2`)

            const r = db.prepare('SELECT id, message FROM reminders WHERE id = ? AND user_jid = ? AND fired = 0').get(id, sender)
            if (!r) return reply(`❌ Reminder #${id} tidak ditemukan atau sudah selesai.`)

            db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(id)
            await react('✅')
            return reply(`✅ Reminder #${id} *"${r.message}"* dibatalkan.`)
        }

        // ─── !remindme <waktu> <pesan> ────────────────
        // Parse: pisahkan token waktu dari pesan
        // Contoh: "30m minum obat", "besok jam 9 meeting", "2h30m call client"

        // Strategi: coba kombinasi prefix token sampai ketemu waktu valid
        let timeMs = null
        let msgStartIdx = 1

        // Coba 1 token, 2 token, 3 token untuk waktu
        for (let i = 1; i <= Math.min(4, args.length); i++) {
            const candidate = args.slice(0, i).join(' ')
            const parsed = parseTime(candidate)
            if (parsed !== null) {
                timeMs = parsed
                msgStartIdx = i
            }
        }

        if (timeMs === null) {
            return reply(
                `❌ Format waktu tidak dikenali.\n\n` +
                `*Format yang didukung:*\n` +
                `• \`!remindme 30m minum obat\`\n` +
                `• \`!remindme 2h meeting klien\`\n` +
                `• \`!remindme 1h30m deadline\`\n` +
                `• \`!remindme jam 14:30 standup\`\n` +
                `• \`!remindme besok jam 9 sidang\`\n` +
                `• \`!remindme 1d kirim laporan\``
            )
        }

        const MIN_MS = 10_000       // min 10 detik
        const MAX_MS = 30 * 86_400_000 // max 30 hari

        if (timeMs < MIN_MS) return reply(`❌ Waktu terlalu pendek. Minimal 10 detik.`)
        if (timeMs > MAX_MS) return reply(`❌ Waktu terlalu jauh. Maksimal 30 hari.`)

        const reminderMsg = args.slice(msgStartIdx).join(' ').trim()
        if (!reminderMsg) return reply(`❌ Pesan remindernya mana?\nContoh: !remindme 30m *minum obat*`)

        // Cek limit per user (max 10 aktif)
        const activeCount = db.prepare('SELECT COUNT(*) as n FROM reminders WHERE user_jid = ? AND fired = 0').get(sender)?.n ?? 0
        if (activeCount >= 10) return reply(`⚠️ Kamu sudah punya 10 reminder aktif.\nHapus dulu: !remindme delete <id>`)

        const fireAt = Math.floor((Date.now() + timeMs) / 1000)

        const result = db.prepare(`
            INSERT INTO reminders (user_jid, chat_id, message, fire_at)
            VALUES (?, ?, ?, ?)
        `).run(sender, chatId, reminderMsg, fireAt)

        await react('⏰')
        return reply(
            `⏰ *Reminder diset!*\n\n` +
            `📌 *${reminderMsg}*\n` +
            `🕐 ${formatDate(fireAt)}\n` +
            `⏳ dalam *${formatMs(timeMs)}*\n\n` +
            `_ID: #${result.lastInsertRowid} | Batalkan: !remindme delete ${result.lastInsertRowid}_`
        )
    }
}