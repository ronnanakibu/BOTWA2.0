// src/handlers/message.js
import { commands } from '../core/loader.js'
import { logger } from '../utils/logger.js'

export async function handleIncomingMessage(sock, { messages }) {
    try {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const sender = isGroup ? msg.key.participant : from

        // 🌟 LOGIKA UNWRAPPER: Bongkar bungkus jika pesan berjenis Ephemeral atau ViewOnce
        let messageContent = msg.message
        const wrapperTypes = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']
        const baseType = Object.keys(messageContent)[0]

        if (wrapperTypes.includes(baseType)) {
            messageContent = messageContent[baseType].message
        }

        if (!messageContent) return

        // Ambil tipe asli pesan setelah dibongkar
        const type = Object.keys(messageContent)[0]

        // Ekstrak teks perintah
        const body = messageContent?.conversation
            || messageContent?.extendedTextMessage?.text
            || messageContent?.imageMessage?.caption
            || messageContent?.videoMessage?.caption
            || ''

        // Paksa console.log tampil di terminal Pterodactyl untuk keperluan debugging live
        console.log(`📩 [Msg Received] From: ${sender} | Type: ${type} | Text: ${body}`)

        const prefix = process.env.BOT_PREFIX || '!'
        if (!body.startsWith(prefix)) return

        const args = body.slice(prefix.length).trim().split(/ +/)
        const commandName = args.shift().toLowerCase()

        const command = commands.get(commandName)
        if (!command) return

        const ctx = {
            sock,
            msg,
            messageContent, // Kita sertakan pesan yang sudah dibongkar ke context
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

        console.log(`🚀 [Exec Command] Running: ${command.name} for ${sender}`)
        await command.execute(ctx)

    } catch (err) {
        // Selain masuk file log, paksa cetak ke konsol agar kamu tahu persis letak rusaknya
        console.error('❌ Error inside message handler:', err.message)
        logger.error(err)
    }
}