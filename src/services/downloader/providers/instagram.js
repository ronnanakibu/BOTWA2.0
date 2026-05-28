// src/services/downloader/providers/instagram.js
// Instagram Downloader — Reels, Posts, Stories, IGTV
// Strategy: cobbler API publik (no auth) → fallback ke scraper
// Priority: cobbler API1 → API2 → API3 (multi fallback untuk reliability)

import { fetchBuffer, fetchJson, sanitizeFilename } from '../utils.js'
import { logger } from '../../../utils/logger.js'

// ─────────────────────────────────────────────
// API ENDPOINTS (publik, no key required)
// Ordered by reliability
// ─────────────────────────────────────────────

const IG_APIS = [
    {
        name: 'SaveIG',
        buildUrl: (url) => `https://v3.saveig.app/api/ajaxSearch?q=${encodeURIComponent(url)}&t=media&lang=id`,
        parse: parseSaveIG,
    },
    {
        name: 'SSYouTube/SnapSave',
        buildUrl: (url) => `https://snapsave.app/action.php?lang=id&url=${encodeURIComponent(url)}`,
        parse: parseSnapSave,
    },
    {
        name: 'InstaFinsta',
        buildUrl: (url) => `https://instafinsta.com/ig?url=${encodeURIComponent(url)}`,
        parse: parseInstaFinsta,
    },
]

// ─────────────────────────────────────────────
// PARSERS — tiap API punya format response beda
// ─────────────────────────────────────────────

function parseSaveIG(data) {
    // SaveIG returns { status: 'ok', data: [{ url, type, ... }] }
    if (data?.status !== 'ok' || !data?.data?.length) return null

    const items = data.data
    // Prioritas: video > image
    const video = items.find(i => i.type === 'mp4' || i.url?.includes('.mp4'))
    const image = items.find(i => i.type === 'jpg' || i.type === 'jpeg' || i.url?.includes('.jpg'))
    const chosen = video ?? image ?? items[0]

    return {
        downloadUrl: chosen.url,
        type: video ? 'video' : 'image',
        thumbnail: data.data.find(i => i.type === 'jpg')?.url ?? null,
        multiple: items.length > 1 ? items.map(i => i.url) : null,
    }
}

function parseSnapSave(html) {
    // SnapSave returns HTML — scrape URL dari dalam
    if (!html || typeof html !== 'string') return null

    const videoMatch = html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/i)
    const imageMatch = html.match(/href="(https:\/\/[^"]+\.jpg[^"]*)"/i)

    const url = videoMatch?.[1] ?? imageMatch?.[1]
    if (!url) return null

    return {
        downloadUrl: decodeURIComponent(url),
        type: videoMatch ? 'video' : 'image',
        thumbnail: null,
        multiple: null,
    }
}

function parseInstaFinsta(data) {
    // InstaFinsta returns { url, thumbnail, ... }
    if (!data?.url) return null
    return {
        downloadUrl: data.url,
        type: data.url.includes('.mp4') ? 'video' : 'image',
        thumbnail: data.thumbnail ?? null,
        multiple: null,
    }
}

// ─────────────────────────────────────────────
// MAIN DOWNLOADER
// ─────────────────────────────────────────────

/**
 * Download Instagram content (Reel, Post, Story, IGTV)
 * Returns: { buffer, filename, caption, mimeType, ext, platform, type }
 */
export async function downloadInstagram(url, options = {}) {
    let lastError = null

    for (const api of IG_APIS) {
        try {
            logger.debug(`[Instagram] Trying API: ${api.name}`)

            const apiUrl = api.buildUrl(url)
            const raw = await fetchJson(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
                    'Referer': 'https://saveig.app/',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                timeout: 15_000,
            })

            const parsed = api.parse(raw)
            if (!parsed?.downloadUrl) {
                logger.debug(`[Instagram] ${api.name} returned no URL, trying next...`)
                continue
            }

            logger.info(`[Instagram] Got URL via ${api.name}: ${parsed.downloadUrl.slice(0, 60)}`)

            // Download the actual media buffer
            const { buffer, mimeType } = await fetchBuffer(parsed.downloadUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
                    'Referer': 'https://www.instagram.com/',
                },
                timeout: 60_000,
                maxSizeMB: 50,
            })

            const ext = parsed.type === 'video' ? 'mp4' : 'jpg'
            const filename = sanitizeFilename(`ig_${Date.now()}.${ext}`)

            return {
                buffer,
                filename,
                caption: `📸 *Instagram ${parsed.type === 'video' ? 'Reels/Video' : 'Post'}*\n_via ${api.name}_`,
                mimeType: parsed.type === 'video' ? 'video/mp4' : 'image/jpeg',
                ext,
                platform: 'instagram',
                type: parsed.type,
                multiple: parsed.multiple ?? null,
            }

        } catch (err) {
            logger.warn(`[Instagram] ${api.name} failed: ${err.message}`)
            lastError = err
        }
    }

    throw new Error(`Gagal download Instagram. ${lastError?.message ?? 'Semua API error.'}`)
}