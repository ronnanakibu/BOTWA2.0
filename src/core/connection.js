// src/core/connection.js
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import path from 'path'

const SESSION_PATH = path.resolve('./storage/sessions')

export async function createSocket() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,     // ANSI QR di headless terminal
        browser: ['WA-Bot-V2', 'Chrome', '120.0.0'],
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 30_000,
        keepAliveIntervalMs: 15_000,
    })

    sock.ev.on('creds.update', saveCreds)  // Save setiap update
    return sock
}

// src/core/connection.js (lanjutan)
sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
        // Option 1: ANSI QR (default, headless-friendly)
        // Baileys sudah handle ini via printQRInTerminal: true

        // Option 2: Generate QR sebagai PNG ke file
        const qrcode = await import('qrcode')
        await qrcode.toFile('./storage/qr-latest.png', qr, { scale: 8 })
        logger.info('QR saved to storage/qr-latest.png')

        // Option 3: Pairing code (no QR scan needed!)
        // const code = await sock.requestPairingCode('628xxxxxxxxxx')
        // logger.info(`Pairing code: ${code}`)
    }

    if (connection === 'close') {
        handleDisconnect(lastDisconnect)
    }

    if (connection === 'open') {
        logger.info('Connected to WhatsApp!')
        eventBus.emit('bot:ready', sock)
    }
})

async function loadAuthWithFallback(sessionPath) {
    try {
        return await useMultiFileAuthState(sessionPath)
    } catch (err) {
        logger.error('Session corrupt, wiping and restarting auth', err)
        await fs.rm(sessionPath, { recursive: true, force: true })
        await fs.mkdir(sessionPath, { recursive: true })
        return await useMultiFileAuthState(sessionPath)
    }
}