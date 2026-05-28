// src/services/downloader/utils.js
// Shared utilities untuk semua downloader providers

import https from 'https'
import http from 'http'
import { URL } from 'url'
import { logger } from '../../utils/logger.js'

const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

// ─────────────────────────────────────────────
// fetchJson — HTTP GET/POST + JSON parse
// Support: GET, POST form-encoded, POST JSON
// ─────────────────────────────────────────────

export function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const {
            method = 'GET',
            headers = {},
            body = null,
            timeout = 15_000,
            isText = false,
        } = options

        const parsed = new URL(url)
        const isHttps = parsed.protocol === 'https:'
        const lib = isHttps ? https : http

        const reqOptions = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method,
            headers: {
                'User-Agent': DEFAULT_UA,
                'Accept': 'application/json, text/html, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                ...headers,
                ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}),
            },
        }

        const req = lib.request(reqOptions, (res) => {
            // Follow redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                return fetchJson(res.headers.location, options).then(resolve).catch(reject)
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} dari ${parsed.hostname}`))
            }

            const chunks = []
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8')
                if (isText) return resolve(raw)

                try {
                    resolve(JSON.parse(raw))
                } catch {
                    // Kalau bukan JSON valid, return raw string
                    resolve(raw)
                }
            })
        })

        req.setTimeout(timeout, () => {
            req.destroy()
            reject(new Error(`Timeout ${timeout}ms untuk ${parsed.hostname}`))
        })

        req.on('error', reject)

        if (body) req.write(body)
        req.end()
    })
}

// ─────────────────────────────────────────────
// fetchBuffer — Download binary file ke Buffer
// Dengan size limit guard untuk mencegah OOM
// ─────────────────────────────────────────────

export function fetchBuffer(url, options = {}) {
    return new Promise((resolve, reject) => {
        const {
            headers = {},
            timeout = 60_000,
            maxSizeMB = 50,
        } = options

        const maxBytes = maxSizeMB * 1024 * 1024

        const doRequest = (targetUrl, redirectCount = 0) => {
            if (redirectCount > 5) return reject(new Error('Terlalu banyak redirect'))

            const parsed = new URL(targetUrl)
            const isHttps = parsed.protocol === 'https:'
            const lib = isHttps ? https : http

            const reqOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers: {
                    'User-Agent': DEFAULT_UA,
                    'Accept': '*/*',
                    ...headers,
                },
            }

            const req = lib.request(reqOptions, (res) => {
                // Follow redirects
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    req.destroy()
                    return doRequest(res.headers.location, redirectCount + 1)
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode} saat download dari ${parsed.hostname}`))
                }

                const contentType = res.headers['content-type'] ?? 'application/octet-stream'

                // Size check dari Content-Length header
                const contentLength = parseInt(res.headers['content-length'] ?? '0')
                if (contentLength > maxBytes) {
                    req.destroy()
                    return reject(new Error(`File terlalu besar: ${Math.round(contentLength / 1024 / 1024)}MB (max ${maxSizeMB}MB)`))
                }

                const chunks = []
                let totalSize = 0

                res.on('data', chunk => {
                    totalSize += chunk.length
                    if (totalSize > maxBytes) {
                        req.destroy()
                        return reject(new Error(`File melampaui batas ${maxSizeMB}MB saat download`))
                    }
                    chunks.push(chunk)
                })

                res.on('end', () => {
                    const buffer = Buffer.concat(chunks)
                    resolve({ buffer, mimeType: contentType.split(';')[0].trim() })
                })

                res.on('error', reject)
            })

            req.setTimeout(timeout, () => {
                req.destroy()
                reject(new Error(`Timeout download ${timeout / 1000}s`))
            })

            req.on('error', reject)
            req.end()
        }

        doRequest(url)
    })
}

// ─────────────────────────────────────────────
// resolveShortUrl — Follow redirect dan return final URL
// Untuk vm.tiktok.com, fb.watch, dll
// ─────────────────────────────────────────────

export function resolveShortUrl(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const follow = (currentUrl, count) => {
            if (count > maxRedirects) return resolve(currentUrl) // return last known URL

            const parsed = new URL(currentUrl)
            const isHttps = parsed.protocol === 'https:'
            const lib = isHttps ? https : http

            const req = lib.request({
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'HEAD',
                headers: { 'User-Agent': DEFAULT_UA },
            }, (res) => {
                req.destroy()
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    // Handle relative redirects
                    const next = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : `${parsed.origin}${res.headers.location}`
                    follow(next, count + 1)
                } else {
                    resolve(currentUrl)
                }
            })

            req.setTimeout(5_000, () => { req.destroy(); resolve(currentUrl) })
            req.on('error', () => resolve(currentUrl))
            req.end()
        }

        follow(url, 0)
    })
}

// ─────────────────────────────────────────────
// sanitizeFilename — Bersihkan karakter ilegal
// ─────────────────────────────────────────────

export function sanitizeFilename(name = '') {
    return name
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .slice(0, 100)
}

// ─────────────────────────────────────────────
// formatBytes — Human readable file size
// ─────────────────────────────────────────────

export function formatBytes(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}