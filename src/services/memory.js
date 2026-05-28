// src/services/memory.js
// SQLite-backed chat memory untuk AI conversation history
// Debounced write — tidak blocking per pesan

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { logger } from '../utils/logger.js'

const DB_PATH = path.resolve(process.env.DB_PATH ?? './storage/database/main.db')
const MAX_HISTORY = parseInt(process.env.AI_MAX_HISTORY ?? '20') // max pesan per chat
const CONTEXT_WINDOW = parseInt(process.env.AI_CONTEXT_WINDOW ?? '10') // pesan yang dikirim ke AI

class MemoryService {
    #db = null
    #cache = new Map() // chatId → messages[] (in-memory cache)

    constructor() {
        this.#init()
    }

    #init() {
        try {
            // Pastikan folder ada
            const dir = path.dirname(DB_PATH)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

            this.#db = new Database(DB_PATH)

            // Performance pragmas — penting untuk Docker/Pterodactyl
            this.#db.pragma('journal_mode = WAL')
            this.#db.pragma('synchronous = NORMAL')
            this.#db.pragma('cache_size = -8000') // 8MB cache
            this.#db.pragma('foreign_keys = ON')

            this.#migrate()
            logger.info('[Memory] SQLite ready →', DB_PATH)
        } catch (err) {
            logger.error('[Memory] DB init failed:', err.message)
            throw err
        }
    }

    #migrate() {
        this.#db.exec(`
            CREATE TABLE IF NOT EXISTS chat_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id     TEXT    NOT NULL,
                role        TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
                content     TEXT    NOT NULL,
                created_at  INTEGER NOT NULL DEFAULT (unixepoch())
            );

            CREATE INDEX IF NOT EXISTS idx_chat_history_chat_id
                ON chat_history(chat_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS chat_config (
                chat_id     TEXT    PRIMARY KEY,
                ai_enabled  INTEGER NOT NULL DEFAULT 1,
                persona     TEXT,
                updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
            );
        `)
    }

    // ─────────────────────────────────────────────
    // HISTORY MANAGEMENT
    // ─────────────────────────────────────────────

    /**
     * Tambah satu pesan ke history.
     * Update cache dulu (sync), tulis ke DB (sync tapi via prepared stmt = cepat).
     */
    addMessage(chatId, role, content) {
        // Update in-memory cache
        if (!this.#cache.has(chatId)) {
            this.#cache.set(chatId, [])
        }
        const history = this.#cache.get(chatId)
        history.push({ role, content })

        // Trim cache kalau sudah terlalu panjang
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY)
        }

        // Tulis ke SQLite — better-sqlite3 adalah synchronous tapi sangat cepat
        // (~0.1ms per write) jadi tidak perlu debounce seperti JSON file
        try {
            this.#db.prepare(`
                INSERT INTO chat_history (chat_id, role, content)
                VALUES (?, ?, ?)
            `).run(chatId, role, content)

            // Trim DB juga — hapus pesan lama kalau sudah > MAX_HISTORY
            this.#db.prepare(`
                DELETE FROM chat_history
                WHERE chat_id = ?
                AND id NOT IN (
                    SELECT id FROM chat_history
                    WHERE chat_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                )
            `).run(chatId, chatId, MAX_HISTORY)

        } catch (err) {
            logger.error('[Memory] Failed to write message:', err.message)
        }
    }

    /**
     * Ambil history untuk dikirim ke AI.
     * Ambil N pesan terakhir dari cache, fallback ke DB kalau cache kosong.
     */
    getHistory(chatId) {
        // Cache miss — load dari DB
        if (!this.#cache.has(chatId)) {
            const rows = this.#db.prepare(`
                SELECT role, content
                FROM chat_history
                WHERE chat_id = ?
                ORDER BY created_at ASC
                LIMIT ?
            `).all(chatId, MAX_HISTORY)

            this.#cache.set(chatId, rows.map(r => ({ role: r.role, content: r.content })))
        }

        const history = this.#cache.get(chatId) ?? []

        // Kirim hanya CONTEXT_WINDOW pesan terakhir ke AI
        return history.slice(-CONTEXT_WINDOW)
    }

    /**
     * Reset memory untuk satu chat.
     */
    clearHistory(chatId) {
        this.#cache.delete(chatId)
        this.#db.prepare('DELETE FROM chat_history WHERE chat_id = ?').run(chatId)
        logger.info(`[Memory] Cleared history for ${chatId}`)
    }

    /**
     * Cek apakah AI aktif di chat tertentu.
     */
    isAiEnabled(chatId) {
        const row = this.#db.prepare('SELECT ai_enabled FROM chat_config WHERE chat_id = ?').get(chatId)
        return row ? Boolean(row.ai_enabled) : true // default: enabled
    }

    /**
     * Toggle AI on/off per chat.
     */
    setAiEnabled(chatId, enabled) {
        this.#db.prepare(`
            INSERT INTO chat_config (chat_id, ai_enabled)
            VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET ai_enabled = excluded.ai_enabled, updated_at = unixepoch()
        `).run(chatId, enabled ? 1 : 0)
    }

    /**
     * Stats untuk !sys atau owner panel.
     */
    getStats() {
        const totalChats = this.#db.prepare('SELECT COUNT(DISTINCT chat_id) as n FROM chat_history').get()?.n ?? 0
        const totalMessages = this.#db.prepare('SELECT COUNT(*) as n FROM chat_history').get()?.n ?? 0
        const cacheSize = this.#cache.size
        return { totalChats, totalMessages, cacheSize }
    }

    /**
     * Graceful shutdown — flush dan tutup DB.
     */
    close() {
        try {
            this.#db?.close()
            logger.info('[Memory] DB closed.')
        } catch (_) { }
    }
}

export const memoryService = new MemoryService()

// Graceful shutdown
process.on('SIGTERM', () => memoryService.close())
process.on('SIGINT', () => memoryService.close())