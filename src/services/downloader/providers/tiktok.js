// src/services/downloader/providers/tiktok.js
// TikTok Downloader — No Watermark
// Strategy: API publik multi-fallback

import { fetchBuffer, fetchJson, resolveShortUrl, sanitizeFilename } from '../utils.js'
import { logger } from '../../../utils/logger.js'

// ─────────────────────────────────────────────
// API ENDPOINTS
// ─────────────────────────────────────────────

const TT_APIS = [
    {
        name: 'TikWM',
        // TikWM adalah salah satu yang paling reliable untuk no-wm
        fetch: async (url) => {
            const res = await fetchJson('https://www.tikwm.com/api/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0',
                },
                body: `url=${encodeURIComponent(url)}&hd=1`,
                timeout: 20_000,
            })

            if (!res?.data?.play && !res?.data?.hdplay) return null

            return {
                // hdplay = no watermark HD, play = no watermark SD
                downloadUrl: res.data.hdplay ?? res.data.play,
                audioUrl: res.data.music_info?.play ?? res.data.music,
                thumbnail: res.data.cover,
                title: res.data.title ?? '',
                author: res.data.author?.nickname ?? '',
                duration: res.data.duration,
                isSlideshow: false,
            }
        }
    },
    {
        name: 'SSSTik',
        fetch: async (url) => {
            // SSSTik menggunakan form POST
            const html = await fetchJson('https://ssstik.io/abc?url=dl', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': 'https://ssstik.io/',
                    'Origin': 'https://ssstik.io',
                },
                body: `id=${encodeURIComponent(url)}&locale=id&tt=aHR0cHM6Ly9zc3N0aWsuaW8v`,
                timeout: 20_000,
                isText: true,
            })

            if (!html || typeof html !== 'string') return null

            // Parse video URL no-watermark dari HTML response
            const noWmMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*>\s*Without watermark/i)
            const fallbackMatch = html.match(/class="pure-button[^"]*"[^>]*href="(https:\/\/tikcdn[^"]+)"/i)
            const videoUrl = noWmMatch?.[1] ?? fallbackMatch?.[1]

            if (!videoUrl) return null

            return {
                downloadUrl: videoUrl,
                audioUrl: null,
                thumbnail: null,
                title: '',
                author: '',
                duration: null,
                isSlideshow: false,
            }
        }
    },
    {
        name: 'TikTokAPI (SnapTik)',
        fetch: async (url) => {
            const res = await fetchJson(`https://api.snaptik.app/tiktok?url=${encodeURIComponent(url)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20_000,
            })

            if (!res?.video) return null

            return {
                downloadUrl: res.video,
                audioUrl: res.music ?? null,
                thumbnail: res.thumbnail ?? null,
                title: res.title ?? '',
                author: res.author ?? '',
                duration: null,
                isSlideshow: false,
            }
        }
    }
]

// ─────────────────────────────────────────────
// MAIN DOWNLOADER
// ─────────────────────────────────────────────

export async function downloadTikTok(rawUrl, options = {}) {
    // Resolve short URLs (vm.tiktok.com, vt.tiktok.com)
    let url = rawUrl
    if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com') || url.includes('/t/')) {
        try {
            url = await resolveShortUrl(rawUrl)
            logger.debug(`[TikTok] Resolved short URL: ${url}`)
        } catch {
            // Lanjut dengan URL original kalau resolve gagal
        }
    }

    let lastError = null

    for (const api of TT_APIS) {
        try {
            logger.debug(`[TikTok] Trying: ${api.name}`)

            const parsed = await api.fetch(url)
            if (!parsed?.downloadUrl) {
                logger.debug(`[TikTok] ${api.name} returned no URL`)
                continue
            }

            logger.info(`[TikTok] Got URL via ${api.name}`)

            const { buffer, mimeType } = await fetchBuffer(parsed.downloadUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 11)',
                    'Referer': 'https://www.tiktok.com/',
                },
                timeout: 60_000,
                maxSizeMB: 50,
            })

            const filename = sanitizeFilename(
                parsed.title
                    ? `tt_${parsed.title.slice(0, 30)}_${Date.now()}.mp4`
                    : `tiktok_${Date.now()}.mp4`
            )

            // Build caption
            let caption = `🎵 *TikTok*`
            if (parsed.author) caption += `\n👤 ${parsed.author}`
            if (parsed.title) caption += `\n📝 ${parsed.title.slice(0, 100)}`
            caption += `\n_No watermark via ${api.name}_`

            return {
                buffer,
                filename,
                caption,
                mimeType: 'video/mp4',
                ext: 'mp4',
                platform: 'tiktok',
                type: 'video',
                thumbnail: parsed.thumbnail ?? null,
                audioUrl: parsed.audioUrl ?? null,
            }

        } catch (err) {
            logger.warn(`[TikTok] ${api.name} failed: ${err.message}`)
            lastError = err
        }
    }

    throw new Error(`Gagal download TikTok. ${lastError?.message ?? 'Semua API error.'}`)
}