// src/handlers/message.js
import { commands } from '../core/loader.js'
import { logger } from '../utils/logger.js'

export async function handleIncomingMessage(sock, { messages }) {
    try {
        const msg = messages[0]
        // Abaikan jika struktur pesan kosong mentah dari server
        if (!msg.message) return

        const from = msg.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const sender = isGroup ? msg.key.participant : from

        // Bongkar isi pesan jika dibungkus pesan ephemeral atau viewonce
        let messageContent = msg.message
        const wrapperTypes = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']
        const baseType = Object.keys(messageContent)[0]

        if (wrapperTypes.includes(baseType)) {
            messageContent = messageContent[baseType].message
        }

        if (!messageContent) return

        const type = Object.keys(messageContent)[0]
        const body = messageContent?.conversation
            || messageContent?.extendedTextMessage?.text
            || messageContent?.imageMessage?.caption
            || messageContent?.videoMessage?.caption
            || ''

        // 🌟 LIVE TELEMETRI (Paling Atas): Cetak semua aktivitas chat sebelum disaring filter
        console.log(`📩 [Event Triggered] From: ${sender} | FromMe: ${msg.key.fromMe} | Type: ${type} | Text: ${body}`)

        // Filter 1: Abaikan jika pesan ini dikirim oleh akun bot itu sendiri
        if (msg.key.fromMe) return

        // Filter 2: Pastikan pesan diawali oleh prefix (! atau sesuai .env)
        const prefix = process.env.BOT_PREFIX || '!'
        if (!body.startsWith(prefix)) return

        const args = body.slice(prefix.length).trim().split(/ +/)
        const commandName = args.shift().toLowerCase()

        console.log(`🔎 [Router] Mencari command: "${commandName}"`)
        const command = commands.get(commandName)

        if (!command) {
            console.log(`⚠️ [Router] Command "${commandName}" tidak ditemukan di ram memori.`)
            return
        }

        // 🌟 FIX: Objek Context (ctx) dihidupkan kembali secara utuh!
        const ctx = {
            sock,
            msg,
            messageContent,
            from,
            sender,
            isGroup,
            args,
            body,
            type,
            reply: async (text, options = {}) => {
                return sock.sendMessage(from, { text, ...options }, { quoted: msg })
            },
            replyMedia: async (content, mediaType, options = {}) => {
                return sock.sendMessage(from, { [mediaType]: content, ...options }, { quoted: msg })
            }
        }

        console.log(`🚀 [Exec] Menjalankan perintah: ${command.name} untuk ${sender}`)
        await command.execute(ctx)

    } catch (err) {
        console.error('❌ Error fatal di dalam message handler:', err.message)
        logger.error(err)
    }
}