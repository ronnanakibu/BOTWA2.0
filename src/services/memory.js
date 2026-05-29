// src/services/memory.js
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { logger } from '../utils/logger.js'

const DB_PATH = path.resolve(process.env.DB_PATH ?? './storage/database/main.db')
const MAX_HISTORY = parseInt(process.env.AI_MAX_HISTORY ?? '20')
const CONTEXT_WINDOW = parseInt(process.env.AI_CONTEXT_WINDOW ?? '10')

class MemoryService {
    #db = null
    #cache = new Map()          // key → messages[]
    #lastCommand = new Map()    // chatId → last command name (untuk context isolation)

    constructor() {
        this.#init()
    }

    #init() {
        try {
            const dir = path.dirname(DB_PATH)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

            this.#db = new Database(DB_PATH)
            this.#db.pragma('journal_mode = WAL')
            this.#db.pragma('synchronous = NORMAL')
            this.#db.pragma('cache_size = -8000')
            this.#db.pragma('foreign_keys = ON')
            this.#migrate()
            logger.info('[Memory] SQLite ready →', DB_PATH)
        } catch (err) {
            logger.error('[Memory] DB init failed:', err.message)
            throw err
        }
    }

    #migrate() {
        // Step 1: Buat tabel dasar dulu — aman untuk DB lama yang belum punya kolom topic
        this.#db.exec(`
            CREATE TABLE IF NOT EXISTS chat_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id     TEXT    NOT NULL,
                role        TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
                content     TEXT    NOT NULL,
                created_at  INTEGER NOT NULL DEFAULT (unixepoch())
            );

            CREATE TABLE IF NOT EXISTS chat_config (
                chat_id     TEXT    PRIMARY KEY,
                ai_enabled  INTEGER NOT NULL DEFAULT 1,
                persona     TEXT,
                updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
            );
        `)

        // Step 2: Tambah kolom topic SEBELUM buat index yang reference kolom ini
        try {
            this.#db.exec(`ALTER TABLE chat_history ADD COLUMN topic TEXT NOT NULL DEFAULT 'general'`)
        } catch (_) { /* kolom sudah ada, skip */ }

        // Step 3: Baru buat index setelah kolom topic pasti ada
        try {
            this.#db.exec(`
                CREATE INDEX IF NOT EXISTS idx_chat_history_lookup
                    ON chat_history(chat_id, topic, created_at DESC);
            `)
        } catch (_) { /* index sudah ada, skip */ }
    }

    // ─────────────────────────────────────────────
    // TOPIC / CONTEXT ISOLATION
    // Key insight: setiap command punya "topic" sendiri.
    // Seamless reply menggunakan topic yang sama dengan command sebelumnya.
    // Jadi !code → reply → reply tetap di konteks 'code',
    // tidak nyampur dengan percakapan 'general' sebelumnya.
    // ─────────────────────────────────────────────

    /**
     * Set topic aktif untuk chatId.
     * Dipanggil setiap kali user menjalankan command baru.
     */
    setActiveTopic(chatId, topic) {
        this.#lastCommand.set(chatId, topic)
    }

    /**
     * Ambil topic aktif untuk chatId.
     * Default: 'general'
     */
    getActiveTopic(chatId) {
        return this.#lastCommand.get(chatId) ?? 'general'
    }

    /**
     * Buat cache key dari chatId + topic.
     */
    #cacheKey(chatId, topic) {
        return `${chatId}::${topic}`
    }

    // ─────────────────────────────────────────────
    // HISTORY MANAGEMENT
    // ─────────────────────────────────────────────

    addMessage(chatId, role, content, topic = null) {
        // Kalau topic tidak di-pass, pakai topic aktif chatId
        const resolvedTopic = topic ?? this.getActiveTopic(chatId)
        const key = this.#cacheKey(chatId, resolvedTopic)

        if (!this.#cache.has(key)) this.#cache.set(key, [])
        const history = this.#cache.get(key)
        history.push({ role, content })

        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY)
        }

        try {
            this.#db.prepare(`
                INSERT INTO chat_history (chat_id, role, content, topic)
                VALUES (?, ?, ?, ?)
            `).run(chatId, role, content, resolvedTopic)

            this.#db.prepare(`
                DELETE FROM chat_history
                WHERE chat_id = ? AND topic = ?
                AND id NOT IN (
                    SELECT id FROM chat_history
                    WHERE chat_id = ? AND topic = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                )
            `).run(chatId, resolvedTopic, chatId, resolvedTopic, MAX_HISTORY)

        } catch (err) {
            logger.error('[Memory] Failed to write message:', err.message)
        }
    }

    getHistory(chatId, topic = null) {
        const resolvedTopic = topic ?? this.getActiveTopic(chatId)
        const key = this.#cacheKey(chatId, resolvedTopic)

        if (!this.#cache.has(key)) {
            const rows = this.#db.prepare(`
                SELECT role, content
                FROM chat_history
                WHERE chat_id = ? AND topic = ?
                ORDER BY created_at ASC
                LIMIT ?
            `).all(chatId, resolvedTopic, MAX_HISTORY)

            this.#cache.set(key, rows.map(r => ({ role: r.role, content: r.content })))
        }

        return (this.#cache.get(key) ?? []).slice(-CONTEXT_WINDOW)
    }

    clearHistory(chatId, topic = null) {
        if (topic) {
            // Clear satu topic saja
            this.#cache.delete(this.#cacheKey(chatId, topic))
            this.#db.prepare('DELETE FROM chat_history WHERE chat_id = ? AND topic = ?').run(chatId, topic)
        } else {
            // Clear semua topic di chatId ini
            for (const key of this.#cache.keys()) {
                if (key.startsWith(chatId + '::')) this.#cache.delete(key)
            }
            this.#db.prepare('DELETE FROM chat_history WHERE chat_id = ?').run(chatId)
            this.#lastCommand.delete(chatId)
        }
        logger.info(`[Memory] Cleared history for ${chatId} topic=${topic ?? 'ALL'}`)
    }

    isAiEnabled(chatId) {
        const row = this.#db.prepare('SELECT ai_enabled FROM chat_config WHERE chat_id = ?').get(chatId)
        return row ? Boolean(row.ai_enabled) : true
    }

    setAiEnabled(chatId, enabled) {
        this.#db.prepare(`
            INSERT INTO chat_config (chat_id, ai_enabled)
            VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET ai_enabled = excluded.ai_enabled, updated_at = unixepoch()
        `).run(chatId, enabled ? 1 : 0)
    }

    getStats() {
        const totalChats = this.#db.prepare('SELECT COUNT(DISTINCT chat_id) as n FROM chat_history').get()?.n ?? 0
        const totalMessages = this.#db.prepare('SELECT COUNT(*) as n FROM chat_history').get()?.n ?? 0
        return { totalChats, totalMessages, cacheSize: this.#cache.size }
    }

    close() {
        try { this.#db?.close() } catch (_) { }
    }
}

export const memoryService = new MemoryService()
process.on('SIGTERM', () => memoryService.close())
process.on('SIGINT', () => memoryService.close())