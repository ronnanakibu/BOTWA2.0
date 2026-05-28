// src/services/downloader/providers/youtube.js
// YouTube Downloader — Audio (MP3) + Video (MP4)
// Default: audio only (ringan, lebih sering dipakai)
// Optional: video via options.format = 'video'

import { fetchBuffer, fetchJson, sanitizeFilename } from '../utils.js'
import { logger } from '../../../utils/logger.js'

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function extractVideoId(url) {
    const patterns = [
        /[?&]v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ]
    for (const re of patterns) {
        const m = url.match(re)
        if (m) return m[1]
    }
    return null
}

// ─────────────────────────────────────────────
// API PROVIDERS
// ─────────────────────────────────────────────

const YT_APIS = [
    {
        name: 'Y2Mate API',
        fetchInfo: async (videoId) => {
            const res = await fetchJson('https://www.y2mate.com/mates/analyzeV2/ajax', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0',
                },
                body: `k_query=https://www.youtube.com/watch?v=${videoId}&k_page=home&hl=id&q_auto=1`,
                timeout: 15_000,
                isText: false,
            })
            return res
        },
        fetchLink: async (videoId, key, format = 'mp3') => {
            const res = await fetchJson('https://www.y2mate.com/mates/convertV2/index', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0',
                },
                body: `vid=${videoId}&k=${key}`,
                timeout: 20_000,
            })
            return res?.dlink ?? null
        },
        parse: (data, format) => {
            if (!data?.vid) return null
            const links = format === 'video'
                ? data?.links?.mp4
                : data?.links?.mp3
            if (!links) return null

            // Ambil kualitas terbaik yang tersedia
            const qualities = Object.values(links)
            const best = qualities.sort((a, b) => {
                const qa = parseInt(a.q) || 0
                const qb = parseInt(b.q) || 0
                return qb - qa
            })[0]

            return {
                key: best?.k,
                title: data.title ?? '',
                thumbnail: `https://i.ytimg.com/vi/${data.vid}/hqdefault.jpg`,
                duration: data.t ?? '',
            }
        }
    },
    {
        name: 'YTDL-Free API',
        // API publik gratis untuk YouTube
        fetchAll: async (url, format) => {
            const endpoint = format === 'video'
                ? `https://ytdl-free.vercel.app/api/video?url=${encodeURIComponent(url)}`
                : `https://ytdl-free.vercel.app/api/audio?url=${encodeURIComponent(url)}`

            const res = await fetchJson(endpoint, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 30_000,
            })

            if (!res?.url) return null

            return {
                downloadUrl: res.url,
                title: res.title ?? '',
                thumbnail: res.thumbnail ?? null,
                duration: res.duration ?? null,
            }
        }
    },
    {
        name: 'YTDLnis',
        fetchAll: async (url, format) => {
            const res = await fetchJson(`https://api.vevioz.com/@api/button/${format === 'video' ? 'mp4' : 'mp3'}/${extractVideoId(url) ?? ''}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20_000,
            })
            if (!res?.link) return null
            return {
                downloadUrl: res.link,
                title: res.title ?? '',
                thumbnail: res.thumbnail ?? null,
            }
        }
    }
]

// ─────────────────────────────────────────────
// MAIN DOWNLOADER
// ─────────────────────────────────────────────

export async function downloadYouTube(url, options = {}) {
    const format = options.format ?? 'audio' // 'audio' | 'video'
    const videoId = extractVideoId(url)

    if (!videoId) {
        throw new Error('Tidak bisa ekstrak Video ID dari URL YouTube.')
    }

    logger.info(`[YouTube] VideoID: ${videoId} | Format: ${format}`)

    let lastError = null

    // ── Strategy 1: Y2Mate (2-step: analyze → convert) ──────────
    try {
        logger.debug('[YouTube] Trying Y2Mate...')
        const api = YT_APIS[0]
        const info = await api.fetchInfo(videoId)
        const parsed = api.parse(info, format)

        if (parsed?.key) {
            const downloadUrl = await api.fetchLink(videoId, parsed.key, format)
            if (downloadUrl) {
                const { buffer, mimeType } = await fetchBuffer(downloadUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 60_000,
                    maxSizeMB: format === 'video' ? 80 : 20,
                })

                const ext = format === 'video' ? 'mp4' : 'mp3'
                const filename = sanitizeFilename(`yt_${parsed.title.slice(0, 30) || videoId}_${Date.now()}.${ext}`)

                return buildResult({ buffer, mimeType, ext, filename, parsed, format, api: 'Y2Mate' })
            }
        }
    } catch (err) {
        logger.warn('[YouTube] Y2Mate failed:', err.message)
        lastError = err
    }

    // ── Strategy 2 & 3: Direct API ─────────────────────────────
    for (const api of YT_APIS.slice(1)) {
        try {
            logger.debug(`[YouTube] Trying ${api.name}...`)
            const info = await api.fetchAll(url, format)
            if (!info?.downloadUrl) continue

            const { buffer, mimeType } = await fetchBuffer(info.downloadUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 60_000,
                maxSizeMB: format === 'video' ? 80 : 20,
            })

            const ext = format === 'video' ? 'mp4' : 'mp3'
            const filename = sanitizeFilename(`yt_${(info.title ?? videoId).slice(0, 30)}_${Date.now()}.${ext}`)

            return buildResult({ buffer, mimeType, ext, filename, parsed: info, format, api: api.name })

        } catch (err) {
            logger.warn(`[YouTube] ${api.name} failed:`, err.message)
            lastError = err
        }
    }

    throw new Error(`Gagal download YouTube. ${lastError?.message ?? 'Semua API error.'}`)
}

function buildResult({ buffer, mimeType, ext, filename, parsed, format, api }) {
    let caption = format === 'video' ? `🎬 *YouTube Video*` : `🎵 *YouTube Audio (MP3)*`
    if (parsed.title) caption += `\n📝 ${parsed.title.slice(0, 100)}`
    if (parsed.duration) caption += `\n⏱️ ${parsed.duration}`
    caption += `\n_via ${api}_`

    return {
        buffer,
        filename,
        caption,
        mimeType: format === 'video' ? 'video/mp4' : 'audio/mpeg',
        ext,
        platform: 'youtube',
        type: format,
        thumbnail: parsed.thumbnail ?? null,
    }
}