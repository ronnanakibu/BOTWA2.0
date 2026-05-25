import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import qrcode from 'qrcode' // ← Impor library qrcode
import 'dotenv/config'

// Custom logger to see connection events, showing only errors to keep it quiet
const logger = pino({ level: 'error' }) 

let reconnectCount = 0
const MAX_RECONNECT_ATTEMPTS = 5

async function startBot() {
    console.log('🤖 [System] Starting bot initialization...')
    
    let version = [2, 3000, 1017531287] // Default fallback version
    try {
        console.log('🤖 [System] Fetching latest WhatsApp Web version from Baileys...')
        const { version: latestVersion } = await fetchLatestBaileysVersion()
        version = latestVersion
        console.log(`🤖 [System] Using WhatsApp Web version: ${version.join('.')}`)
    } catch (err) {
        console.log('⚠️ [System] Failed to fetch latest web version, using default fallback:', err.message)
    }

    const sessionPath = process.env.SESSION_PATH || './storage/sessions'
    console.log(`🤖 [System] Loading session auth state from: ${sessionPath}`)
    
    let state, saveCreds
    try {
        const auth = await useMultiFileAuthState(sessionPath)
        state = auth.state
        saveCreds = auth.saveCreds
        console.log('🤖 [System] Auth state loaded successfully.')
    } catch (err) {
        console.error('❌ [System] Failed to load auth state:', err)
        return
    }

    console.log('🤖 [System] Connecting to WhatsApp...')
    const sock = makeWASocket({
        version,
        auth: state,
        logger, // Pass pino logger to see the connection details
    })

    // 📱 Logika Pengambilan Phone Number Pairing Code
    const phoneNumber = process.env.BOT_NUMBER ? process.env.BOT_NUMBER.replace(/[^0-9]/g, '') : null
    if (phoneNumber && !state.creds?.registered) {
        console.log(`🤖 [System] Fresh session detected. Requesting pairing code for +${phoneNumber} in 3 seconds...`)
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber)
                // Memformat kode menjadi format cantik XXXX-XXXX seperti di aplikasi WhatsApp asli
                const formattedCode = code.match(/.{1,4}/g)?.join('-') || code
                console.log('\n==================================================')
                console.log(`🔑 YOUR WHATSAPP PAIRING CODE: ${formattedCode.toUpperCase()}`)
                console.log('==================================================\n')
            } catch (err) {
                console.error('❌ [System] Error requesting pairing code:', err)
            }
        }, 3000)
    }

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        // Tampilkan QR Code hanya jika qr ada DAN tidak menggunakan metode nomor pairing
        if (qr && !phoneNumber) {
            console.log('📱 [System] QR Code generated! Scan this QR code with your WhatsApp Link Device:')
            qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
                if (err) console.error('❌ [System] Failed to render QR Code:', err)
                else console.log(url)
            })
        }

        if (connection === 'open') {
            console.log('✅ [System] Bot connected successfully to WhatsApp!')
            reconnectCount = 0 // Reset reconnect count on successful connection
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error
            const statusCode = new Boom(error)?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            console.log(`❌ [System] Connection closed. Status Code: ${statusCode}, Error:`, error?.message || error)
            console.log('❌ [System] Reconnect decision:', shouldReconnect)

            if (shouldReconnect) {
                if (reconnectCount < MAX_RECONNECT_ATTEMPTS) {
                    reconnectCount++
                    const delay = Math.min(Math.pow(2, reconnectCount) * 1000, 30000) // Exponential backoff: 2s, 4s, 8s, 16s... up to 30s
                    console.log(`🔄 [System] Reconnecting in ${delay / 1000} seconds (Attempt ${reconnectCount}/${MAX_RECONNECT_ATTEMPTS})...`)
                    setTimeout(() => {
                        startBot()
                    }, delay)
                } else {
                    console.log('❌ [System] Maximum reconnect attempts reached. Please restart the bot manually.')
                }
            } else {
                console.log('🔒 [System] Logged out from WhatsApp. Please delete the session folder and scan again.')
            }
        }
    })

    // Test: reply on ping command
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
        console.log(`📩 [Msg] From ${msg.key.remoteJid}: ${text}`)

        if (text === '!ping') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! 🏓' })
        }
    })
}

startBot()