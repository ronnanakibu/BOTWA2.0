import Database from 'better-sqlite3'

class DBService {
    constructor(path) {
        this.db = new Database(path)
        this.db.pragma('journal_mode = WAL')  // Performance critical untuk Docker
        this.db.pragma('synchronous = NORMAL')
    }

    getUser(jid) {
        return this.db.prepare('SELECT * FROM users WHERE jid = ?').get(jid)
    }

    upsertUser(jid, data) {
        return this.db.prepare(`
      INSERT INTO users (jid, name, xp) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET name=excluded.name, xp=excluded.xp
    `).run(jid, data.name, data.xp ?? 0)
    }
}