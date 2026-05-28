// src/services/downloader/index.js
// Downloader Service — Unified entry point
// Provider priority: Instagram → TikTok → YouTube → Facebook → Auto-detect

import { detectPlatform } from './detector.js'
import { downloadInstagram } from './providers/instagram.js'
import { downloadTikTok } from './providers/tiktok.js'
import { downloadYouTube } from './providers/youtube.js'
import { downloadFacebook } from './providers/facebook.js'
import { DownloadQueue } from './queue.js'
import { logger } from '../../utils/logger.js'

// Singleton queue — shared across all providers
export const downloadQueue = new DownloadQueue({ concurrency: 3, timeout: 90_000 })

// Provider registry
const PROVIDERS = {
    instagram: downloadInstagram,
    tiktok: downloadTikTok,
    youtube: downloadYouTube,
    facebook: downloadFacebook,
}

/**
 * Main download function.
 * Auto-detects platform, routes to correct provider.
 * Returns { buffer, filename, caption, mimeType, ext, platform }
 */
export async function download(url, options = {}) {
    const platform = detectPlatform(url)

    if (!platform) {
        throw new Error('URL tidak dikenali. Paste link dari Instagram, TikTok, YouTube, atau Facebook.')
    }

    const provider = PROVIDERS[platform]
    if (!provider) {
        throw new Error(`Platform "${platform}" belum didukung.`)
    }

    logger.info(`[Downloader] Platform: ${platform} | URL: ${url.slice(0, 60)}`)

    // Queue-based execution — mencegah overload
    return downloadQueue.add(() => provider(url, options), {
        label: `${platform}:${url.slice(-20)}`
    })
}

export { detectPlatform }