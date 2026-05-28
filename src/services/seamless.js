// src/services/seamless.js
// Seamless AI Detection — ID-based tracking
// Kalau user reply ke pesan bot, otomatis masuk konteks AI
// Lebih reliable dari v1 yang pakai string marker

class SeamlessTracker {
    // Set of message IDs yang dikirim oleh bot
    // Kalau user reply ke ID ini = seamless AI trigger
    #botMessageIds = new Set()

    // Batas maksimal ID yang disimpan di memory (anti memory leak)
    #maxSize = 500

    /**
     * Daftarkan message ID yang dikirim bot.
     * Dipanggil setelah bot berhasil sendMessage().
     */
    track(msgId) {
        if (!msgId) return
        this.#botMessageIds.add(msgId)

        // Auto-trim kalau sudah terlalu banyak — hapus yang paling lama
        if (this.#botMessageIds.size > this.#maxSize) {
            const first = this.#botMessageIds.values().next().value
            this.#botMessageIds.delete(first)
        }
    }

    /**
     * Cek apakah pesan ini adalah reply ke pesan bot.
     * Return true = trigger seamless AI.
     */
    isReplyToBot(quotedMsgId) {
        if (!quotedMsgId) return false
        return this.#botMessageIds.has(quotedMsgId)
    }

    /**
     * Hapus ID tertentu (kalau pesan dihapus misalnya).
     */
    untrack(msgId) {
        this.#botMessageIds.delete(msgId)
    }

    get size() {
        return this.#botMessageIds.size
    }
}

export const seamlessTracker = new SeamlessTracker()