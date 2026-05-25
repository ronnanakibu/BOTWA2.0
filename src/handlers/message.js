// src/handlers/message.js
import { commands } from '../core/loader.js'
import { logger } from '../utils/logger.js'

export async function handleIncomingMessage(sock, m) {
    try {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const sender = isGroup ? msg.key.participant : from

        // Ekstrak teks dari berbagai tipe pesan
        const type = Object.keys(msg.message)[0]
        const body = msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || msg.message?.imageMessage?.caption
            || msg.message?.videoMessage?.caption
            || ''

        const prefix = process.env.BOT_PREFIX || '!'
        if (!body.startsWith(prefix)) return

        const args = body.slice(prefix.length).trim().split(/ +/)
        const commandName = args.shift().toLowerCase()

        const command = commands.get(commandName)
        if (!command) return

        // Bangun Object Context (ctx) sesuai ekspektasi plugin kamu
        const ctx = {
            sock,
            msg,
            from,
            sender,
            isGroup,
            args,
            body,
            type,
            // Helper function untuk reply instan bermutu (auto-quoted)
            reply: async (text, options = {}) => {
                return sock.sendMessage(from, { text, ...options }, { quoted: msg })
            },
            // Helper function untuk kirim media langsung
            replyMedia: async (content, mediaType, options = {}) => {
                return sock.sendMessage(from, { [mediaType]: content, ...options }, { quoted: msg })
            }
        }

        // TODO: Di fase berikutnya, kamu tinggal selipkan pipeline middleware di sini
        // (antispam -> validator -> cooldown -> permission)

        logger.info(`🚀 [Cmd] ${command.name} executed by ${sender}`)
        await command.execute(ctx)

    } catch (err) {
        logger.error('❌ Error in message handler:', err)
    }
}