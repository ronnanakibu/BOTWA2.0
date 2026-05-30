// src/commands/general/remindme.js
// !remindme — Set reminder dengan alarm call / voice note

import Database from 'better-sqlite3'
import path from 'path'
import { triggerAlarm } from '../../services/alarm.js'
import { logger } from '../../utils/logger.js'

const DB_PATH = path.resolve(process.env.DB_PATH ?? './storage/database/main.db')

/**
 * Inisialisasi dan ambil koneksi database SQLite
 * @returns {Database} Instance database
 */
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
            use_call    INTEGER NOT NULL DEFAULT 1,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at, fired);
        
        CREATE TABLE IF NOT EXISTS reminder_prefs (
            user_jid    TEXT    PRIMARY KEY,
            use_call    INTEGER NOT NULL DEFAULT 1,
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `)
    return db
}

// ─────────────────────────────────────────────
// TIME PARSER
// ─────────────────────────────────────────────

/**
 * Parse durasi singkat (cth: 30m, 1h, 2d)
 */
function parseDuration(str) {
    str = str.toLowerCase().trim()

    // Format singkat: 1d2h30m
    const shortMatch = str.match(/^((\d+)d)?((\d+)h)?((\d+)m)?$/)
    if (shortMatch && (shortMatch[2] || shortMatch[4] || shortMatch[6])) {
        const d = parseInt(shortMatch[2] ?? 0)
        const h = parseInt(shortMatch[4] ?? 0)
        const m = parseInt(shortMatch[6] ?? 0)
        const ms = (d * 86400 + h * 3600 + m * 60) * 1000
        if (ms > 0) return ms
    }

    // Format natural: 30 menit, 1 jam, dll
    const naturalMap = [
        { re: /(\d+)\s*(detik|sec?)/i, mul: 1_000 },
        { re: /(\d+)\s*(menit|min(?:ute)?s?)/i, mul: 60_000 },
        { re: /(\d+)\s*(jam|h(?:ou)?r?s?)/i, mul: 3_600_000 },
        { re: /(\d+)\s*(hari|days?)/i, mul: 86_400_000 },
        { re: /(\d+)\s*(minggu|weeks?)/i, mul: 604_800_000 },
    ]

    let total = 0
    for (const { re, mul } of naturalMap) {
        const m = str.match(re)
        if (m) total += parseInt(m[1]) * mul
    }

    return total > 0 ? total : null
}

/**
 * Parse waktu absolut (cth: jam 14:30, besok jam 9)
 */
function parseAbsoluteTime(str) {
    const jamMatch = str.match(/jam\s+(\d{1,2})(?::(\d{2}))?\s*(pagi|siang|sore|malam)?/i)

    if (jamMatch) {
        let hour = parseInt(jamMatch[1])
        const min = parseInt(jamMatch[2] ?? 0)
        const period = jamMatch[3]?.toLowerCase()

        if (period === 'sore' || period === 'malam') {
            if (hour < 12) hour += 12
        } else if (period === 'pagi') {
            if (hour === 12) hour = 0
        } else {
            if (hour >= 1 && hour <= 6) hour += 12
        }

        const now = new Date()
        const target = new Date(now)
        target.setHours(hour, min, 0, 0)

        if (target <= now) target.setDate(target.getDate() + 1)
        return target.getTime() - now.getTime()
    }

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

    if (d > 0) return `${d} hari ${h % 24 > 0 ? (h % 24) + ' jam' : ''}`.trim()
    if (h > 0) return `${h} jam ${m % 60 > 0 ? (m % 60) + ' menit' : ''}`.trim()
    if (m > 0) return `${m} menit`
    return `${s} detik`
}

function formatDate(unixTs) {
    return new Date(unixTs * 1000).toLocaleString('id-ID', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    })
}

// ─────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────

let _sock = null
let _schedulerStarted = false

/**
 * Menjalankan background job untuk cek reminder aktif
 */
export function initReminderScheduler(sock) {
    if (_schedulerStarted) return
    _schedulerStarted = true
    _sock = sock

    logger.info('Reminder scheduler started')

    setInterval(async () => {
        try {
            const db = getDb()
            const now = Math.floor(Date.now() / 1000)
            const due = db.prepare(`
                SELECT * FROM reminders
                WHERE fire_at <= ? AND fired = 0
                ORDER BY fire_at ASC LIMIT 20
            `).all(now)

            for (const reminder of due) {
                try {
                    logger.info(`[Reminder] Firing #${reminder.id} → ${reminder.chat_id}`)

                    // Kirim ke chat_id (bisa DM atau grup)
                    // Kalau DM: user_jid = chat_id, call works
                    // Kalau grup: call tidak bisa, langsung text
                    const isDM = !reminder.chat_id.endsWith('@g.us')

                    await triggerAlarm(
                        _sock,
                        reminder.chat_id,
                        reminder.message,
                        isDM && Boolean(reminder.use_call) // Call hanya untuk DM
                    )

                    db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(reminder.id)
                } catch (e) {
                    logger.error(`[Reminder] Fire error #${reminder.id}:`, e.message)
                }
            }
        } catch (e) {
            logger.error("[Reminder] Scheduler tick error:", e.message)
        }
    }, 30_000)
}

// ─────────────────────────────────────────────
// COMMAND
// ─────────────────────────────────────────────

export default {
    name: 'remindme',
    aliases: ['remind', 'ingatkan', 'alarm', 'r'],
    category: 'general',
    description: 'Set reminder — bot bakal ring/ping kamu tepat waktu.',
    usage: '!remindme <waktu> <pesan>',
    example: '!remindme 30m Minum obat | !remindme besok jam 9 Meeting',
    cooldown: 2,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sender, chatId, sock } = ctx
        initReminderScheduler(sock)

        const db = getDb()
        const sub = args[0]?.toLowerCase()

        // ── !remindme list ────────────────────────────
        if (!args.length || sub === 'list' || sub === 'ls') {
            const reminders = db.prepare(`
                SELECT * FROM reminders
                WHERE user_jid = ? AND fired = 0
                ORDER BY fire_at ASC LIMIT 10
            `).all(sender)

            // Cek preferensi call user
            const pref = db.prepare('SELECT use_call FROM reminder_prefs WHERE user_jid = ?').get(sender)
            const useCall = pref ? Boolean(pref.use_call) : true
            const callStatus = useCall ? '📞 Call ON' : '🔕 Call OFF'

            if (!reminders.length) {
                return reply(
                    `⏰ *Tidak ada reminder aktif.*\n` +
                    `Mode: *${callStatus}*\n\n` +
                    `Set reminder:\n` +
                    `• *!remindme 30m minum obat*\n` +
                    `• *!remindme 2h meeting*\n` +
                    `• *!remindme besok jam 9 sidang*\n\n` +
                    `Toggle alarm call: *!remindme call on/off*`
                )
            }

            const list = reminders.map((r, i) => {
                const remaining = r.fire_at - Math.floor(Date.now() / 1000)
                const eta = remaining > 0 ? `dalam ${formatMs(remaining * 1000)}` : 'segera'
                const callIcon = r.use_call ? '📞' : '🔔'

                return `${i + 1}. ${callIcon} [#${r.id}] *${r.message}*\n   📅 ${formatDate(r.fire_at)} _(${eta})_`
            }).join('\n\n')

            return reply(
                `⏰ *Reminder aktif (${reminders.length}):*\n` +
                `Mode: *${callStatus}*\n\n` +
                `${list}\n\n` +
                `_Hapus: !remindme delete <id>_`
            )
        }

        // ── !remindme call on/off ─────────────────────
        if (sub === 'call') {
            const toggle = args[1]?.toLowerCase()

            if (!toggle || !['on', 'off'].includes(toggle)) {
                const pref = db.prepare('SELECT use_call FROM reminder_prefs WHERE user_jid = ?').get(sender)
                const current = pref ? Boolean(pref.use_call) : true

                return reply(
                    `📞 *Mode Alarm Call*\n\n` +
                    `Status sekarang: *${current ? 'ON ✅' : 'OFF 🔕'}*\n\n` +
                    `• *!remindme call on* — Bot nge-ring kamu waktu reminder\n` +
                    `• *!remindme call off* — Kirim notif teks aja\n\n` +
                    `_⚠️ Call hanya untuk DM ke bot, tidak berlaku di grup._`
                )
            }

            const useCall = toggle === 'on'
            db.prepare(`
                INSERT INTO reminder_prefs (user_jid, use_call)
                VALUES (?, ?)
                ON CONFLICT(user_jid) DO UPDATE SET use_call = excluded.use_call, updated_at = unixepoch()
            `).run(sender, useCall ? 1 : 0)

            await react(useCall ? '📞' : '🔕')

            return reply(
                useCall
                    ? `📞 *Mode Call ON*\nBot bakal nge-ring HP kamu waktu reminder tiba!\n\n_Pastikan chat ini DM ke bot, bukan grup._`
                    : `🔕 *Mode Call OFF*\nBot cukup kirim notif teks waktu reminder tiba.`
            )
        }

        // ── !remindme delete <id> ─────────────────────
        if (['delete', 'del', 'cancel', 'hapus'].includes(sub)) {
            const id = parseInt(args[1])
            if (!id) return reply(`❌ Kasih ID reminder.\nContoh: !remindme delete 2`)

            const r = db.prepare('SELECT id, message FROM reminders WHERE id = ? AND user_jid = ? AND fired = 0').get(id, sender)
            if (!r) return reply(`❌ Reminder #${id} tidak ditemukan atau sudah selesai.`)

            db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(id)
            await react('✅')

            return reply(`✅ Reminder #${id} *"${r.message}"* dibatalkan.`)
        }

        // ── !remindme <waktu> <pesan> ─────────────────
        let timeMs = null
        let msgStartIdx = 1

        for (let i = 1; i <= Math.min(4, args.length); i++) {
            const parsed = parseTime(args.slice(0, i).join(' '))
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
                `• \`!remindme 2h meeting\`\n` +
                `• \`!remindme 1h30m deadline\`\n` +
                `• \`!remindme jam 14:30 standup\`\n` +
                `• \`!remindme besok jam 9 sidang\`\n` +
                `• \`!remindme 1d kirim laporan\``
            )
        }

        const MIN_MS = 10_000
        const MAX_MS = 30 * 86_400_000

        if (timeMs < MIN_MS) return reply(`❌ Minimal 10 detik.`)
        if (timeMs > MAX_MS) return reply(`❌ Maksimal 30 hari.`)

        const reminderMsg = args.slice(msgStartIdx).join(' ').trim()
        if (!reminderMsg) return reply(`❌ Pesan remindernya mana?\nContoh: !remindme 30m *minum obat*`)

        const activeCount = db.prepare('SELECT COUNT(*) as n FROM reminders WHERE user_jid = ? AND fired = 0').get(sender)?.n ?? 0
        if (activeCount >= 10) return reply(`⚠️ Sudah ada 10 reminder aktif. Hapus dulu: !remindme delete <id>`)

        // Ambil preferensi call user
        const pref = db.prepare('SELECT use_call FROM reminder_prefs WHERE user_jid = ?').get(sender)
        const useCall = pref ? Boolean(pref.use_call) : true

        // Kalau di grup, call tidak bisa
        const isDM = !chatId.endsWith('@g.us')
        const willCall = isDM && useCall
        const fireAt = Math.floor((Date.now() + timeMs) / 1000)

        db.prepare(`
            INSERT INTO reminders (user_jid, chat_id, message, fire_at, use_call)
            VALUES (?, ?, ?, ?, ?)
        `).run(sender, chatId, reminderMsg, fireAt, useCall ? 1 : 0)

        const callNote = willCall
            ? `📞 Bot akan *nge-ring* kamu waktu reminder tiba`
            : isDM
                ? `🔕 Mode call off — kirim notif teks`
                : `🔔 Reminder di grup — notif teks (call hanya DM)`

        await react('⏰')

        return reply(
            `⏰ *Reminder diset!*\n\n` +
            `📌 *${reminderMsg}*\n` +
            `🕐 ${formatDate(fireAt)}\n` +
            `⏳ dalam *${formatMs(timeMs)}*\n` +
            `${callNote}\n\n` +
            `_Toggle call: !remindme call on/off_`
        )
    }
}