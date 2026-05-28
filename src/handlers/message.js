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
        const isDM = !isGroup && from.endsWith('@s.whatsapp.net')
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

        // Bot JID — normalisasi format Baileys
        const rawBotId = sock.user?.id ?? ''
        const botJid = rawBotId.includes(':')
            ? rawBotId.replace(/:\d+@/, '@')
            : rawBotId

        // Quoted message — untuk seamless AI & command reply
        const quotedMsgId = messageContent?.extendedTextMessage?.contextInfo?.stanzaId ?? null
        const isReplyToBot = seamlessTracker.isReplyToBot(quotedMsgId)

        // Mention detection — @bot di grup
        const mentionedJids = messageContent?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
        const isMentionedInGroup = isGroup && mentionedJids.includes(botJid)

        // 🆕 DM trigger — pesan langsung ke bot tanpa prefix = AI
        // Tapi jangan trigger kalau itu command (ada prefix)
        const prefix = process.env.BOT_PREFIX || '!'
        const isCommand = body.startsWith(prefix)
        const isDMTrigger = isDM && !isCommand && body.trim().length > 0

        // Strip mention dari body untuk prompt AI yang bersih
        const bodyWithoutMention = body
            .replace(/@\d+/g, '')
            .replace(/\s+/g, ' ')
            .trim()

        // ─────────────────────────────────────────────
        // HELPERS
        // ─────────────────────────────────────────────

        const reply = async (text, options = {}) => {
            const sent = await sock.sendMessage(from, { text, ...options }, { quoted: msg })
            if (sent?.key?.id) seamlessTracker.track(sent.key.id)
            return sent
        }

        const react = async (emoji) => {
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
        }

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
            isDM,
            body,
            bodyWithoutMention,
            type,
            quotedMsgId,
            isReplyToBot,
            isMentioned: isMentionedInGroup,
            isDMTrigger,
            reply,
            react,
            downloadMedia,
            replyMedia: async (content, mediaType, options = {}) => {
                return sock.sendMessage(from, { [mediaType]: content, ...options }, { quoted: msg })
            }
        }

        // ─────────────────────────────────────────────
        // ROUTE 1: COMMAND (prefix)
        // ─────────────────────────────────────────────

        if (isCommand) {
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
        // ROUTE 3: MENTION DI GRUP — @bot [pertanyaan]
        // ─────────────────────────────────────────────

        if (isMentionedInGroup && bodyWithoutMention) {
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

        // ─────────────────────────────────────────────
        // ROUTE 4: DM TRIGGER — pesan langsung ke bot
        // User chat ke bot tanpa prefix = langsung AI
        // ─────────────────────────────────────────────

        if (isDMTrigger) {
            if (!memoryService.isAiEnabled(from)) return
            console.log(`🤖 [DM] "${body.slice(0, 60)}"`)

            await react('🤔')
            try {
                const result = await aiService.chat(from, body)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                logger.error('[DM] AI error:', err.message)
            }
            return
        }

    } catch (err) {
        console.error('❌ Error fatal di message handler:', err.message)
        logger.error(err)
    }
}