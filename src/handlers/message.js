// src/handlers/message.js
import { commands } from '../core/loader.js'
import { logger } from '../utils/logger.js'
import { aiService } from '../services/ai.js'
import { memoryService } from '../services/memory.js'
import { seamlessTracker } from '../services/seamless.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

export async function handleIncomingMessage(sock, { messages }) {
    try {
        const msg = messages[0]
        if (!msg.message) return

        const from = msg.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const sender = isGroup ? msg.key.participant : from

        // Unwrap ephemeral / viewonce / documentWithCaption
        let messageContent = msg.message
        const wrapperTypes = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']
        const baseType = Object.keys(messageContent)[0]
        if (wrapperTypes.includes(baseType)) {
            messageContent = messageContent[baseType].message
        }
        if (!messageContent) return

        const type = Object.keys(messageContent)[0]
        const body =
            messageContent?.conversation
            || messageContent?.extendedTextMessage?.text
            || messageContent?.imageMessage?.caption
            || messageContent?.videoMessage?.caption
            || ''

        // 🌟 Live telemetri
        console.log(`📩 [Event] From: ${sender} | FromMe: ${msg.key.fromMe} | Type: ${type} | Text: ${body}`)

        // Filter: abaikan pesan dari bot sendiri
        if (msg.key.fromMe) return

        // ─────────────────────────────────────────────
        // CONTEXT BUILDER
        // ─────────────────────────────────────────────

        // Bot JID untuk deteksi mention di grup
        const botJid = sock.user?.id?.replace(/:\d+/, '') + '@s.whatsapp.net'

        // Quoted message — untuk seamless AI & command reply
        const quotedMsgId = messageContent?.extendedTextMessage?.contextInfo?.stanzaId ?? null
        const isReplyToBot = seamlessTracker.isReplyToBot(quotedMsgId)

        // Mention detection — @bot di grup
        const mentionedJids = messageContent?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
        const isMentioned = isGroup && mentionedJids.includes(botJid)

        // Strip mention dari body untuk prompt AI yang bersih
        // "@628xxx hei bot siapa kamu?" → "hei bot siapa kamu?"
        const bodyWithoutMention = body
            .replace(/@\d+/g, '')
            .replace(/\s+/g, ' ')
            .trim()

        // Helper: reply + auto-track seamless
        const reply = async (text, options = {}) => {
            const sent = await sock.sendMessage(from, { text, ...options }, { quoted: msg })
            if (sent?.key?.id) seamlessTracker.track(sent.key.id)
            return sent
        }

        // Helper: react emoji
        const react = async (emoji) => {
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
        }

        // Helper: download media
        const downloadMedia = async (targetMsg = msg) => {
            try {
                return await downloadMediaMessage(targetMsg, 'buffer', {})
            } catch (err) {
                logger.error('[Handler] Download media failed:', err.message)
                return null
            }
        }

        const ctx = {
            sock,
            msg,
            messageContent,
            from,
            chatId: from,
            sender,
            isGroup,
            body,
            bodyWithoutMention,
            type,
            quotedMsgId,
            isReplyToBot,
            isMentioned,
            reply,
            react,
            downloadMedia,
            replyMedia: async (content, mediaType, options = {}) => {
                return sock.sendMessage(from, { [mediaType]: content, ...options }, { quoted: msg })
            }
        }

        const prefix = process.env.BOT_PREFIX || '!'

        // ─────────────────────────────────────────────
        // ROUTE 1: COMMAND (prefix)
        // ─────────────────────────────────────────────

        if (body.startsWith(prefix)) {
            const rawArgs = body.slice(prefix.length).trim().split(/ +/)
            const commandName = rawArgs.shift().toLowerCase()

            ctx.args = rawArgs
            ctx.commandName = commandName

            console.log(`🔎 [Router] Command: "${commandName}"`)
            const command = commands.get(commandName)

            if (!command) {
                console.log(`⚠️ [Router] "${commandName}" tidak ditemukan.`)
                return
            }

            console.log(`🚀 [Exec] ${command.name} → ${sender}`)
            await command.execute(ctx)
            return
        }

        // ─────────────────────────────────────────────
        // ROUTE 2: SEAMLESS AI — reply ke pesan bot
        // User reply ke pesan bot tanpa prefix = lanjut konteks AI
        // ─────────────────────────────────────────────

        if (isReplyToBot && body.trim()) {
            if (!memoryService.isAiEnabled(from)) return
            console.log(`🤖 [Seamless] "${body.slice(0, 60)}"`)

            await react('🤔')
            try {
                const result = await aiService.chat(from, body)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                logger.error('[Seamless] AI error:', err.message)
            }
            return
        }

        // ─────────────────────────────────────────────
        // ROUTE 3: MENTION DI GRUP → trigger AI
        // @RonnBot [pertanyaan] tanpa prefix
        // ─────────────────────────────────────────────

        if (isMentioned && bodyWithoutMention) {
            if (!memoryService.isAiEnabled(from)) return
            console.log(`🤖 [Mention] "${bodyWithoutMention.slice(0, 60)}"`)

            await react('🤔')
            try {
                const result = await aiService.chat(from, bodyWithoutMention)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                logger.error('[Mention] AI error:', err.message)
            }
            return
        }

    } catch (err) {
        console.error('❌ Error fatal di message handler:', err.message)
        logger.error(err)
    }
}