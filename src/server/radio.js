// src/server/radio.js
// HTTP Streaming Server untuk radio
// Listener connect ke /stream dan dapat audio MP3 real-time

import http from 'http'
import { radioService } from '../services/radio.js'
import { logger } from '../utils/logger.js'

const RADIO_PORT = parseInt(process.env.RADIO_PORT ?? '8080')

let server = null

export function startRadioServer() {
    if (server) return // sudah running

    server = http.createServer((req, res) => {
        const url = req.url?.split('?')[0]

        // ── GET /stream — audio stream endpoint ──
        if (url === '/stream' && req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Transfer-Encoding': 'chunked',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache, no-store',
                'Access-Control-Allow-Origin': '*',
                'icy-name': process.env.BOT_NAME ?? 'RonnBot Radio',
                'icy-br': '128',
            })

            radioService.addClient(res)

            // Kalau radio idle saat ada yang join, mulai play kalau ada queue
            if (!radioService.isPlaying && radioService.queue.length > 0) {
                radioService.start().catch(err => logger.error('[Radio] Auto-start error:', err.message))
            }

            return
        }

        // ── GET /status — info JSON ──
        if (url === '/status' && req.method === 'GET') {
            const info = radioService.getNowPlayingInfo()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
                isPlaying: radioService.isPlaying,
                listeners: radioService.listenerCount,
                queue: radioService.queue.length,
                nowPlaying: info?.track ? {
                    title: info.track.title,
                    duration: info.track.durationFormatted,
                    thumbnail: info.track.thumbnail,
                } : null,
                fx: radioService.activeFx,
                eq: radioService.activeEq,
            }))
            return
        }

        // ── 404 ──
        res.writeHead(404)
        res.end('Not found')
    })

    server.listen(RADIO_PORT, () => {
        logger.info(`[Radio] HTTP server listening on port ${RADIO_PORT}`)
        console.log(`📻 [Radio] Stream URL: http://[server-ip]:${RADIO_PORT}/stream`)
        console.log(`📻 [Radio] Status URL: http://[server-ip]:${RADIO_PORT}/status`)
    })

    server.on('error', (err) => {
        logger.error('[Radio] Server error:', err.message)
    })

    return server
}

export function stopRadioServer() {
    server?.close()
    server = null
}