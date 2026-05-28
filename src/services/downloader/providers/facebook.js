// src/services/downloader/providers/facebook.js
// Facebook Video Downloader — Posts, Reels, Watch
// Strategy: Multi-API publik

import { fetchBuffer, fetchJson, sanitizeFilename } from '../utils.js'
import { logger } from '../../../utils/logger.js'

const FB_APIS = [
    {
        name: 'SaveFrom',
        fetch: async (url) => {
            const res = await fetchJson(
                `https://sfrom.net/api/button/1?url=${encodeURIComponent(url)}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    timeout: 15_000,
                }
            )
            if (!res?.url?.length) return null
            // Ambil kualitas HD dulu, SD sebagai fallback
            const hd = res.url.find(u => u.id === 'hd')
            const sd = res.url.find(u => u.id === 'sd')
            return {
                downloadUrl: (hd ?? sd)?.url ?? null,
                quality: hd ? 'HD' : 'SD',
                title: res.title ?? '',
                thumbnail: res.thumb ?? null,
            }
        }
    },
    {
        name: 'FBDownloader',
        fetch: async (url) => {
            const res = await fetchJson(
                `https://fbdownloader.net/api/facebook?url=${encodeURIComponent(url)}`,
                {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15_000,
                }
            )
            if (!res?.video) return null
            return {
                downloadUrl: res.video,
                quality: 'HD',
                title: res.title ?? '',
                thumbnail: res.thumbnail ?? null,
            }
        }
    },
    {
        name: 'GetFVid',
        fetch: async (url) => {
            // GetFVid pakai form POST
            const html = await fetchJson('https://getfvid.com/downloader', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://getfvid.com/',
                },
                body: `url=${encodeURIComponent(url)}`,
                timeout: 20_000,
                isText: true,
            })

            if (!html) return null

            // Scrape HD link dari response HTML
            const hdMatch = html.match(/href="(https:\/\/video\.xx\.fbcdn[^"]+)"\s+[^>]*HD/i)
            const sdMatch = html.match(/href="(https:\/\/video\.xx\.fbcdn[^"]+)"\s+[^>]*SD/i)
            const url2 = hdMatch?.[1] ?? sdMatch?.[1]

            if (!url2) return null

            return {
                downloadUrl: url2.replace(/&amp;/g, '&'),
                quality: hdMatch ? 'HD' : 'SD',
                title: '',
                thumbnail: null,
            }
        }
    }
]

export async function downloadFacebook(url, options = {}) {
    // Resolve fb.watch short links
    const cleanUrl = url.replace('fb.watch', 'www.facebook.com/watch?v=')

    let lastError = null

    for (const api of FB_APIS) {
        try {
            logger.debug(`[Facebook] Trying: ${api.name}`)
            const parsed = await api.fetch(cleanUrl)

            if (!parsed?.downloadUrl) continue

            logger.info(`[Facebook] Got URL via ${api.name}`)

            const { buffer, mimeType } = await fetchBuffer(parsed.downloadUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://www.facebook.com/',
                },
                timeout: 60_000,
                maxSizeMB: 80,
            })

            const filename = sanitizeFilename(
                parsed.title
                    ? `fb_${parsed.title.slice(0, 30)}_${Date.now()}.mp4`
                    : `facebook_${Date.now()}.mp4`
            )

            let caption = `📘 *Facebook Video*`
            if (parsed.title) caption += `\n📝 ${parsed.title.slice(0, 100)}`
            if (parsed.quality) caption += `\n🎞️ Kualitas: ${parsed.quality}`
            caption += `\n_via ${api.name}_`

            return {
                buffer,
                filename,
                caption,
                mimeType: 'video/mp4',
                ext: 'mp4',
                platform: 'facebook',
                type: 'video',
                thumbnail: parsed.thumbnail ?? null,
            }

        } catch (err) {
            logger.warn(`[Facebook] ${api.name} failed: ${err.message}`)
            lastError = err
        }
    }

    throw new Error(`Gagal download Facebook. ${lastError?.message ?? 'Semua API error.'}`)
}