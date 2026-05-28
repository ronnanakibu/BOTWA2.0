// src/commands/general/notes.js
// !notes — Simpan & ambil catatan personal per user
// Alias: !note, !catatan, !memo

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// ─────────────────────────────────────────────
// DB SETUP — pakai SQLite yang sama dengan memory
// ─────────────────────────────────────────────

const DB_PATH = path.resolve(process.env.DB_PATH ?? './storage/database/main.db')

function getDb() {
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')

    db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_jid    TEXT    NOT NULL,
            title       TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_jid, created_at DESC);
    `)
    return db
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function formatDate(unixTs) {
    return new Date(unixTs * 1000).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}

// ─────────────────────────────────────────────
// COMMAND
// ─────────────────────────────────────────────

export default {
    name: 'notes',
    aliases: ['note', 'catatan', 'memo', 'n'],
    category: 'general',
    description: 'Simpan & ambil catatan personal.',
    usage: '!notes add <judul> | <isi> | !notes list | !notes get <id> | !notes delete <id>',
    example: '!notes add Ide Project | Bikin bot WA dengan Baileys',
    cooldown: 2,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sender } = ctx
        const db = getDb()

        const sub = args[0]?.toLowerCase()

        // ─── !notes list ───────────────────────────────
        if (!sub || sub === 'list' || sub === 'ls') {
            const notes = db.prepare(`
                SELECT id, title, created_at FROM notes
                WHERE user_jid = ?
                ORDER BY created_at DESC
                LIMIT 20
            `).all(sender)

            if (!notes.length) {
                return reply(
                    `📝 *Catatan kamu kosong.*\n\n` +
                    `Tambah dengan:\n*!notes add Judul | Isi catatan*`
                )
            }

            const list = notes.map((n, i) =>
                `${i + 1}. [#${n.id}] *${n.title}*\n   _${formatDate(n.created_at)}_`
            ).join('\n\n')

            return reply(`📝 *Catatan kamu (${notes.length}):*\n\n${list}\n\n_Ketik !notes get <id> untuk baca_`)
        }

        // ─── !notes add <judul> | <isi> ───────────────
        if (sub === 'add' || sub === 'save' || sub === 'baru') {
            const rawInput = args.slice(1).join(' ')

            if (!rawInput) {
                return reply(
                    `❌ Format salah.\n\n` +
                    `*!notes add Judul | Isi catatan*\n\n` +
                    `Contoh:\n!notes add Meeting hari ini | Bahas fitur baru bot, deploy jam 3`
                )
            }

            // Split judul & isi pakai separator "|"
            const separatorIdx = rawInput.indexOf('|')
            let title, content

            if (separatorIdx === -1) {
                // Kalau tidak ada "|", judul = kata pertama, isi = sisanya
                const words = rawInput.trim().split(' ')
                title = words[0]
                content = words.length > 1 ? words.slice(1).join(' ') : words[0]
            } else {
                title = rawInput.slice(0, separatorIdx).trim()
                content = rawInput.slice(separatorIdx + 1).trim()
            }

            if (!title || !content) {
                return reply(`❌ Judul dan isi catatan tidak boleh kosong.`)
            }

            // Cek limit per user (max 50 notes)
            const count = db.prepare('SELECT COUNT(*) as n FROM notes WHERE user_jid = ?').get(sender)?.n ?? 0
            if (count >= 50) {
                return reply(`⚠️ Catatan kamu sudah penuh (50/50).\nHapus dulu yang lama: *!notes delete <id>*`)
            }

            const result = db.prepare(`
                INSERT INTO notes (user_jid, title, content) VALUES (?, ?, ?)
            `).run(sender, title, content)

            await react('✅')
            return reply(
                `✅ *Catatan disimpan!*\n\n` +
                `📌 *[#${result.lastInsertRowid}] ${title}*\n` +
                `${content}\n\n` +
                `_Ambil lagi dengan: !notes get ${result.lastInsertRowid}_`
            )
        }

        // ─── !notes get <id> ──────────────────────────
        if (sub === 'get' || sub === 'read' || sub === 'baca') {
            const id = parseInt(args[1])
            if (!id) return reply(`❌ Kasih ID catatan.\nContoh: !notes get 3`)

            const note = db.prepare(`
                SELECT * FROM notes WHERE id = ? AND user_jid = ?
            `).get(id, sender)

            if (!note) return reply(`❌ Catatan #${id} tidak ditemukan.`)

            return reply(
                `📌 *[#${note.id}] ${note.title}*\n\n` +
                `${note.content}\n\n` +
                `_Dibuat: ${formatDate(note.created_at)}_\n` +
                `_Edit: !notes edit ${note.id} | konten baru_`
            )
        }

        // ─── !notes edit <id> | <konten baru> ────────
        if (sub === 'edit' || sub === 'update') {
            const rawInput = args.slice(1).join(' ')
            const sepIdx = rawInput.indexOf('|')

            if (sepIdx === -1) {
                return reply(`❌ Format: *!notes edit <id> | konten baru*`)
            }

            const id = parseInt(rawInput.slice(0, sepIdx).trim())
            const newContent = rawInput.slice(sepIdx + 1).trim()

            if (!id || !newContent) return reply(`❌ ID atau konten tidak valid.`)

            const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_jid = ?').get(id, sender)
            if (!note) return reply(`❌ Catatan #${id} tidak ditemukan.`)

            db.prepare(`
                UPDATE notes SET content = ?, updated_at = unixepoch() WHERE id = ? AND user_jid = ?
            `).run(newContent, id, sender)

            await react('✅')
            return reply(`✅ Catatan #${id} diupdate!`)
        }

        // ─── !notes delete <id> ───────────────────────
        if (sub === 'delete' || sub === 'del' || sub === 'hapus' || sub === 'rm') {
            const id = parseInt(args[1])
            if (!id) return reply(`❌ Kasih ID catatan.\nContoh: !notes delete 3`)

            const note = db.prepare('SELECT id, title FROM notes WHERE id = ? AND user_jid = ?').get(id, sender)
            if (!note) return reply(`❌ Catatan #${id} tidak ditemukan.`)

            db.prepare('DELETE FROM notes WHERE id = ? AND user_jid = ?').run(id, sender)

            await react('🗑️')
            return reply(`🗑️ Catatan #${id} *"${note.title}"* dihapus.`)
        }

        // ─── !notes clear ─────────────────────────────
        if (sub === 'clear' || sub === 'reset') {
            const count = db.prepare('SELECT COUNT(*) as n FROM notes WHERE user_jid = ?').get(sender)?.n ?? 0
            if (count === 0) return reply(`📝 Catatan kamu sudah kosong.`)

            db.prepare('DELETE FROM notes WHERE user_jid = ?').run(sender)
            await react('🗑️')
            return reply(`🗑️ Semua ${count} catatan dihapus.`)
        }

        // ─── !notes search <keyword> ──────────────────
        if (sub === 'search' || sub === 'cari') {
            const keyword = args.slice(1).join(' ').trim()
            if (!keyword) return reply(`❌ Kasih keyword.\nContoh: !notes search meeting`)

            const results = db.prepare(`
                SELECT id, title, content, created_at FROM notes
                WHERE user_jid = ? AND (title LIKE ? OR content LIKE ?)
                ORDER BY created_at DESC LIMIT 10
            `).all(sender, `%${keyword}%`, `%${keyword}%`)

            if (!results.length) return reply(`🔍 Tidak ada catatan yang cocok dengan "*${keyword}*"`)

            const list = results.map(n =>
                `[#${n.id}] *${n.title}*\n_${n.content.slice(0, 80)}${n.content.length > 80 ? '...' : ''}_`
            ).join('\n\n')

            return reply(`🔍 *Hasil pencarian "${keyword}":*\n\n${list}`)
        }

        // ─── Help fallback ────────────────────────────
        return reply(
            `📝 *!notes — Catatan Personal*\n\n` +
            `*!notes list* — Lihat semua catatan\n` +
            `*!notes add Judul | Isi* — Tambah catatan\n` +
            `*!notes get <id>* — Baca catatan\n` +
            `*!notes edit <id> | konten baru* — Edit\n` +
            `*!notes delete <id>* — Hapus satu\n` +
            `*!notes search <kata>* — Cari catatan\n` +
            `*!notes clear* — Hapus semua\n\n` +
            `_Max 50 catatan per user_`
        )
    }
}