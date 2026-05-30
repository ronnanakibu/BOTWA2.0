// src/services/radio.js
// RadioService — Live Radio Streaming Engine
// Architecture: ytdl-core → FFmpeg → HTTP chunked stream → listeners
// No yt-dlp binary needed — uses @distube/ytdl-core + youtube-sr (Node.js native)

import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'

// ─────────────────────────────────────────────
// YOUTUBE HELPERS (Node.js native, no binary needed)
// ─────────────────────────────────────────────

// Lazy-load ytdl-core to avoid startup crash if not yet installed
async function getYtdlCore() {
    try {
        const mod = await import('@distube/ytdl-core')
        return mod.default ?? mod
    } catch (e) {
        throw new Error(`@distube/ytdl-core belum terinstall. Restart bot untuk install otomatis. (${e.message})`)
    }
}

async function getYoutubeSR() {
    try {
        const mod = await import('youtube-sr')
        return mod.default?.default ?? mod.default ?? mod
    } catch (e) {
        throw new Error(`youtube-sr belum terinstall. Restart bot untuk install otomatis. (${e.message})`)
    }
}

/**
 * Cari lagu di YouTube. Return { title, url, duration (detik), thumbnail }.
 */
async function youtubeSearch(query) {
    const YouTube = await getYoutubeSR()
    const results = await YouTube.search(query, { limit: 1, type: 'video' })
    if (!results || results.length === 0) throw new Error('Lagu tidak ditemukan di YouTube.')
    const v = results[0]
    return {
        title: v.title || 'Unknown',
        url: `https://www.youtube.com/watch?v=${v.id}`,
        duration: Math.floor((v.duration || 0) / 1000),  // youtube-sr returns ms
        thumbnail: v.thumbnail?.url || v.thumbnail || null
    }
}

/**
 * Ambil info lagu dari URL langsung (bukan search).
 */
async function youtubeGetInfo(url) {
    const ytdl = await getYtdlCore()
    const info = await ytdl.getBasicInfo(url)
    const d = info.videoDetails
    return {
        title: d.title || 'Unknown',
        url,
        duration: parseInt(d.lengthSeconds) || 0,
        thumbnail: d.thumbnails?.slice(-1)[0]?.url || null
    }
}

/**
 * Ambil URL audio stream terbaik dari video YouTube.
 * Return: URL CDN yang langsung bisa dipakai ffmpeg.
 */
async function youtubeGetAudioUrl(videoUrl) {
    const ytdl = await getYtdlCore()
    const info = await ytdl.getInfo(videoUrl)
    
    // Coba audioonly dulu, fallback ke format apapun yang punya audio
    let format = ytdl.chooseFormat(info.formats, {
        filter: 'audioonly',
        quality: 'highestaudio'
    })
    if (!format?.url) {
        format = ytdl.chooseFormat(info.formats, {
            filter: f => f.hasAudio,
            quality: 'highestaudio'
        })
    }
    if (!format?.url) throw new Error('Tidak bisa mendapatkan audio stream URL dari YouTube.')
    return format.url
}


const RADIO_PORT = parseInt(process.env.RADIO_PORT ?? '8080')
const MAX_QUEUE = parseInt(process.env.RADIO_MAX_QUEUE ?? '20')
const CHUNK_SIZE = 64 * 1024  // 64KB per chunk ke listeners

// Audio FX presets via FFmpeg filter
const FX_PRESETS = {
    normal: '',
    tupai: 'asetrate=44100*1.8,aresample=44100',              // pitch up
    lambat: 'asetrate=44100*0.7,aresample=44100',              // pitch down + slow
    bass: 'bass=g=10,volume=1.5',                            // bass boost
    robot: 'afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512',
    reverb: 'aecho=0.8:0.88:60:0.4',                          // reverb echo
    louder: 'volume=2.0',                                      // +volume
}

// EQ presets
const EQ_PRESETS = {
    flat: '',
    pop: 'equalizer=f=60:t=o:w=200:g=3,equalizer=f=3000:t=o:w=1000:g=2',
    rock: 'equalizer=f=60:t=o:w=200:g=5,equalizer=f=1000:t=o:w=500:g=-2,equalizer=f=8000:t=o:w=2000:g=4',
    jazz: 'equalizer=f=250:t=o:w=200:g=3,equalizer=f=4000:t=o:w=1000:g=2',
    bass: 'equalizer=f=60:t=o:w=100:g=8,equalizer=f=200:t=o:w=200:g=4',
    classic: 'equalizer=f=250:t=o:w=200:g=2,equalizer=f=1000:t=o:w=500:g=-1,equalizer=f=4000:t=o:w=2000:g=3',
}

// ─────────────────────────────────────────────
// TRACK MODEL
// ─────────────────────────────────────────────

class Track {
    constructor({ title, url, duration, thumbnail, requestedBy }) {
        this.title = title
        this.url = url          // YouTube URL atau direct URL
        this.duration = duration     // detik
        this.thumbnail = thumbnail
        this.requestedBy = requestedBy  // sender JID
        this.addedAt = Date.now()
    }

    get durationFormatted() {
        if (!this.duration) return 'LIVE'
        const m = Math.floor(this.duration / 60)
        const s = this.duration % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }
}

// ─────────────────────────────────────────────
// RADIO SERVICE
// ─────────────────────────────────────────────

class RadioService extends EventEmitter {
    // Private state
    #queue = []          // Track[]
    #currentTrack = null        // Track | null
    #ffmpeg = null        // FFmpeg child process
    #clients = new Set()   // HTTP response streams
    #isPlaying = false
    #activeFx = 'normal'
    #activeEq = 'flat'
    #skipRequested = false
    #playTimeout = null

    constructor() {
        super()
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })
    }

    // ─────────────────────────────────────────────
    // PUBLIC GETTERS
    // ─────────────────────────────────────────────

    get isPlaying() { return this.#isPlaying }
    get currentTrack() { return this.#currentTrack }
    get queue() { return [...this.#queue] }
    get listenerCount() { return this.#clients.size }
    get activeFx() { return this.#activeFx }
    get activeEq() { return this.#activeEq }

    // ─────────────────────────────────────────────
    // SEARCH & RESOLVE
    // ─────────────────────────────────────────────

    /**
     * Search YouTube dan return info lagu via ytdl-core + youtube-sr (Node.js native).
     * Return Track object atau throw kalau tidak ketemu.
     */
    async search(query, requestedBy) {
        const isUrl = /^https?:\/\//.test(query)

        let info
        if (isUrl) {
            info = await youtubeGetInfo(query)
        } else {
            info = await youtubeSearch(query)
        }

        return new Track({
            title:       info.title,
            url:         info.url,
            duration:    info.duration,
            thumbnail:   info.thumbnail,
            requestedBy
        })
    }

    /**
     * Batch search — untuk !play a, b, c
     */
    async searchBatch(queries, requestedBy) {
        const results = []
        for (const q of queries) {
            try {
                const track = await this.search(q.trim(), requestedBy)
                results.push({ track, error: null })
            } catch (err) {
                results.push({ track: null, error: err.message, query: q })
            }
        }
        return results
    }

    // ─────────────────────────────────────────────
    // QUEUE MANAGEMENT
    // ─────────────────────────────────────────────

    addToQueue(track) {
        if (this.#queue.length >= MAX_QUEUE) {
            throw new Error(`Queue penuh (max ${MAX_QUEUE} lagu). Tunggu giliran!`)
        }
        this.#queue.push(track)
        this.emit('queue:add', track)
        logger.info(`[Radio] Queued: ${track.title} by ${track.requestedBy}`)
    }

    removeFromQueue(index) {
        if (index < 0 || index >= this.#queue.length) return null
        const [removed] = this.#queue.splice(index, 1)
        return removed
    }

    clearQueue() {
        this.#queue = []
        this.emit('queue:clear')
    }

    // ─────────────────────────────────────────────
    // PLAYBACK ENGINE
    // ─────────────────────────────────────────────

    /**
     * Mulai play lagu berikutnya dari queue.
     * Dipanggil otomatis setelah lagu selesai atau skip.
     */
    async #playNext() {
        if (this.#queue.length === 0) {
            this.#isPlaying = false
            this.#currentTrack = null
            this.emit('radio:idle')
            logger.info('[Radio] Queue habis, radio idle.')
            return
        }

        this.#currentTrack = this.#queue.shift()
        this.#isPlaying = true
        this.#skipRequested = false
        this.emit('track:start', this.#currentTrack)
        logger.info(`[Radio] Now playing: ${this.#currentTrack.title}`)

        try {
            await this.#streamTrack(this.#currentTrack)
        } catch (err) {
            logger.error('[Radio] Stream error:', err.message)
            this.emit('track:error', { track: this.#currentTrack, error: err.message })
        }

        // Lagu selesai — lanjut ke berikutnya
        if (!this.#skipRequested) {
            await this.#playNext()
        }
    }

    /**
     * Stream satu track via ytdl-core → FFmpeg → HTTP clients.
     * ytdl-core mengambil URL audio CDN, lalu ffmpeg transcode ke MP3.
     */
    async #streamTrack(track) {
        return new Promise(async (resolve, reject) => {
            try {
                // Build FFmpeg audio filter chain
                const filters = []
                if (FX_PRESETS[this.#activeFx]) filters.push(FX_PRESETS[this.#activeFx])
                if (EQ_PRESETS[this.#activeEq]) filters.push(EQ_PRESETS[this.#activeEq])
                const filterStr = filters.join(',')

                // ytdl-core: ambil URL audio CDN (tanpa download)
                process.stdout.write(`\x1b[36m[Radio] Resolving audio URL for: ${track.title}\x1b[0m\n`)
                const streamUrl = await youtubeGetAudioUrl(track.url)
                process.stdout.write(`\x1b[32m[Radio] Audio URL resolved. Starting FFmpeg...\x1b[0m\n`)

                // FFmpeg: transcode ke MP3 128kbps untuk streaming
                const ffArgs = [
                    '-reconnect', '1',
                    '-reconnect_streamed', '1',
                    '-reconnect_delay_max', '5',
                    '-i', streamUrl,
                    '-vn',                          // no video
                    '-acodec', 'libmp3lame',
                    '-ab', '128k',
                    '-ar', '44100',
                    '-ac', '2',
                ]

                // Inject audio filter kalau ada
                if (filterStr) ffArgs.push('-af', filterStr)

                ffArgs.push(
                    '-f', 'mp3',
                    '-loglevel', 'error',
                    'pipe:1'                        // output ke stdout
                )

                const ffProc = spawn('ffmpeg', ffArgs)
                this.#ffmpeg = ffProc

                // Broadcast setiap chunk ke semua HTTP clients
                ffProc.stdout.on('data', (chunk) => this.#broadcast(chunk))

                ffProc.stderr.on('data', d => {
                    logger.debug('[FFmpeg]', d.toString().trim())
                })

                ffProc.on('close', (ffCode) => {
                    this.#ffmpeg = null
                    if (ffCode === 0 || this.#skipRequested) {
                        resolve()
                    } else {
                        reject(new Error(`FFmpeg exit code ${ffCode}`))
                    }
                })

                ffProc.on('error', (e) => {
                    reject(new Error(`FFmpeg error: ${e.message}`))
                })

                // Timeout safety: kalau lagu > 10 menit timeout
                const maxDuration = Math.min((track.duration || 600) + 30, 660) * 1000
                this.#playTimeout = setTimeout(() => {
                    logger.warn(`[Radio] Timeout lagu ${track.title}, force skip`)
                    this.#killProcesses()
                    resolve()
                }, maxDuration)

            } catch (err) {
                process.stdout.write(`\x1b[31m[Radio] streamTrack error: ${err.message}\x1b[0m\n`)
                reject(err)
            }
        }).finally(() => {
            clearTimeout(this.#playTimeout)
        })
    }

    /**
     * Broadcast audio chunk ke semua HTTP clients.
     * Auto-cleanup client yang sudah disconnect.
     */
    #broadcast(chunk) {
        for (const client of this.#clients) {
            if (client.destroyed || !client.writable) {
                this.#clients.delete(client)
                continue
            }
            try {
                client.write(chunk)
            } catch {
                this.#clients.delete(client)
            }
        }
    }

    // ─────────────────────────────────────────────
    // CONTROLS
    // ─────────────────────────────────────────────

    /**
     * Start radio — play lagu pertama dari queue.
     * Kalau sudah playing, tidak melakukan apa-apa.
     */
    async start() {
        if (this.#isPlaying) return
        await this.#playNext()
    }

    /**
     * Skip lagu sekarang → lanjut ke berikutnya.
     */
    async skip() {
        if (!this.#isPlaying) return false
        this.#skipRequested = true
        this.#killProcesses()

        // Tunggu sebentar biar proses benar-benar mati
        await new Promise(r => setTimeout(r, 500))
        await this.#playNext()
        return true
    }

    /**
     * Stop radio sepenuhnya — clear queue dan kill semua proses.
     */
    stop() {
        this.#skipRequested = true
        this.#killProcesses()
        this.#queue = []
        this.#currentTrack = null
        this.#isPlaying = false
        this.emit('radio:stop')
        logger.info('[Radio] Stopped.')
    }

    /**
     * Set audio FX.
     */
    setFx(name) {
        if (!FX_PRESETS.hasOwnProperty(name)) {
            throw new Error(`FX tidak dikenal: ${name}. Tersedia: ${Object.keys(FX_PRESETS).join(', ')}`)
        }
        this.#activeFx = name
        // Efek berlaku di lagu berikutnya (tidak bisa inject ke stream aktif)
        this.emit('fx:change', name)
    }

    /**
     * Set EQ preset.
     */
    setEq(name) {
        if (!EQ_PRESETS.hasOwnProperty(name)) {
            throw new Error(`EQ tidak dikenal: ${name}. Tersedia: ${Object.keys(EQ_PRESETS).join(', ')}`)
        }
        this.#activeEq = name
        this.emit('eq:change', name)
    }

    // ─────────────────────────────────────────────
    // HTTP CLIENT MANAGEMENT
    // ─────────────────────────────────────────────

    /**
     * Register HTTP response stream sebagai listener.
     * Dipanggil dari radio HTTP server saat ada request ke /stream.
     */
    addClient(res) {
        this.#clients.add(res)
        this.emit('listener:join', this.#clients.size)
        logger.info(`[Radio] Listener joined. Total: ${this.#clients.size}`)

        const cleanup = () => {
            this.#clients.delete(res)
            this.emit('listener:leave', this.#clients.size)
            logger.info(`[Radio] Listener left. Total: ${this.#clients.size}`)
        }

        res.on('close', cleanup)
        res.on('error', cleanup)
        res.on('finish', cleanup)
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    #killProcesses() {
        clearTimeout(this.#playTimeout)
        try { this.#ffmpeg?.kill('SIGKILL') } catch (_) { }
        this.#ffmpeg = null
    }

    /**
     * Info lengkap untuk !np (now playing).
     */
    getNowPlayingInfo() {
        if (!this.#currentTrack) return null
        return {
            track: this.#currentTrack,
            queue: this.#queue.length,
            listeners: this.#clients.size,
            fx: this.#activeFx,
            eq: this.#activeEq,
        }
    }

    /**
     * Graceful shutdown.
     */
    destroy() {
        this.stop()
        for (const client of this.#clients) {
            try { client.end() } catch (_) { }
        }
        this.#clients.clear()
    }
}

// Singleton export
export const radioService = new RadioService()

// Graceful shutdown
process.on('SIGTERM', () => radioService.destroy())
process.on('SIGINT', () => radioService.destroy())

// Re-export constants untuk dipakai command files
export const AVAILABLE_FX = Object.keys(FX_PRESETS)
export const AVAILABLE_EQ = Object.keys(EQ_PRESETS)