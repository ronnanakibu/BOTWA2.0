// src/services/downloader/detector.js
// Platform detection dari URL

const PLATFORM_PATTERNS = [
    {
        platform: 'instagram',
        patterns: [
            /instagram\.com\/(p|reel|reels|tv|stories)\//i,
            /instagram\.com\/[^/]+\/p\//i,
            /instagr\.am\//i,
        ]
    },
    {
        platform: 'tiktok',
        patterns: [
            /tiktok\.com\/@[^/]+\/video\//i,
            /tiktok\.com\/t\//i,
            /vm\.tiktok\.com\//i,
            /vt\.tiktok\.com\//i,
            /m\.tiktok\.com\//i,
        ]
    },
    {
        platform: 'youtube',
        patterns: [
            /youtube\.com\/watch\?v=/i,
            /youtube\.com\/shorts\//i,
            /youtu\.be\//i,
            /youtube\.com\/embed\//i,
        ]
    },
    {
        platform: 'facebook',
        patterns: [
            /facebook\.com\/.*\/videos\//i,
            /facebook\.com\/watch\?v=/i,
            /facebook\.com\/reel\//i,
            /fb\.watch\//i,
            /fb\.com\//i,
        ]
    },
]

/**
 * Detect platform from URL string.
 * Returns platform name or null if unrecognized.
 */
export function detectPlatform(url = '') {
    if (!url || typeof url !== 'string') return null

    // Clean URL — hapus tracking params yang sering bikin regex meleset
    const cleanUrl = url.split('?')[0].split('#')[0]

    for (const { platform, patterns } of PLATFORM_PATTERNS) {
        if (patterns.some(re => re.test(url) || re.test(cleanUrl))) {
            return platform
        }
    }

    return null
}

/**
 * Ekstrak clean URL dari teks (kalau user paste URL + teks lain)
 */
export function extractUrl(text = '') {
    const urlRegex = /https?:\/\/[^\s]+/gi
    const matches = text.match(urlRegex)
    return matches?.[0] ?? null
}

/**
 * Validasi apakah URL bisa diakses (basic check)
 */
export function isValidUrl(url = '') {
    try {
        const parsed = new URL(url)
        return ['http:', 'https:'].includes(parsed.protocol)
    } catch {
        return false
    }
}