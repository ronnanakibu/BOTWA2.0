// src/handlers/message.js
import { commands } from '../core/loader.js'
import { logger, botLogger } from '../utils/logger.js'
import { aiService } from '../services/ai.js'
import { memoryService } from '../services/memory.js'
import { seamlessTracker } from '../services/seamless.js'
import { checkPermission } from '../middleware/permission.js'
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

        // Filter: abaikan pesan dari bot sendiri
        if (msg.key.fromMe) return

        // Log setiap incoming message
        botLogger.message({ sender, type, body, isGroup, chatId: from })

        // ─────────────────────────────────────────────
        // CONTEXT BUILDER
        // ─────────────────────────────────────────────

        const rawBotId = sock.user?.id ?? ''
        const botJid = rawBotId.includes(':')
            ? rawBotId.replace(/:\d+@/, '@')
            : rawBotId

        const quotedMsgId = messageContent?.extendedTextMessage?.contextInfo?.stanzaId ?? null
        const isReplyToBot = seamlessTracker.isReplyToBot(quotedMsgId)

        const mentionedJids = messageContent?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
        const isMentionedInGroup = isGroup && mentionedJids.includes(botJid)

        const prefix = process.env.BOT_PREFIX || '!'
        const isCommand = body.startsWith(prefix)
        const isDMTrigger = isDM && !isCommand && body.trim().length > 0

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
                botLogger.debug('handler', 'Downloading media...')
                return await downloadMediaMessage(targetMsg, 'buffer', {})
            } catch (err) {
                botLogger.err('handler', err, 'downloadMedia')
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

            const command = commands.get(commandName)

            if (!command) {
                botLogger.warn('handler', `Unknown command: "${commandName}" from ${sender}`)
                return
            }

            // ── PERMISSION CHECK ──
            const permResult = await checkPermission(ctx, command)
            if (!permResult.allowed) {
                await react('🚫')
                await reply(permResult.reason ?? '🚫 Akses ditolak.')
                botLogger.warn('handler', `Permission denied: ${commandName} for ${sender}`)
                return
            }

            // ── EXECUTE ──
            botLogger.command(commandName, sender, rawArgs)
            const startMs = Date.now()

            try {
                await command.execute(ctx)
                botLogger.commandDone(commandName, Date.now() - startMs)
            } catch (err) {
                botLogger.err('handler', err, `cmd:${commandName}`)
                await react('❌')
                await reply(`❌ Error di command *${commandName}*:\n${err.message}`)
            }

            return
        }

        // ─────────────────────────────────────────────
        // ROUTE 2: SEAMLESS AI
        // ─────────────────────────────────────────────

        if (isReplyToBot && body.trim()) {
            if (!memoryService.isAiEnabled(from)) return

            botLogger.aiTrigger('seamless', body)
            await react('🤔')
            const startMs = Date.now()

            try {
                const result = await aiService.chat(from, body)
                botLogger.ai(result.provider, result.model, from, Date.now() - startMs)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                botLogger.err('seamless', err)
            }
            return
        }

        // ─────────────────────────────────────────────
        // ROUTE 3: MENTION DI GRUP
        // ─────────────────────────────────────────────

        if (isMentionedInGroup && bodyWithoutMention) {
            if (!memoryService.isAiEnabled(from)) return

            botLogger.aiTrigger('mention', bodyWithoutMention)
            await react('🤔')
            const startMs = Date.now()

            try {
                const result = await aiService.chat(from, bodyWithoutMention)
                botLogger.ai(result.provider, result.model, from, Date.now() - startMs)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                botLogger.err('mention', err)
            }
            return
        }

        // ─────────────────────────────────────────────
        // ROUTE 4: DM TRIGGER
        // ─────────────────────────────────────────────

        if (isDMTrigger) {
            if (!memoryService.isAiEnabled(from)) return

            botLogger.aiTrigger('dm', body)
            await react('🤔')
            const startMs = Date.now()

            try {
                const result = await aiService.chat(from, body)
                botLogger.ai(result.provider, result.model, from, Date.now() - startMs)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                botLogger.err('dm', err)
            }
            return
        }

    } catch (err) {
        botLogger.err('handler', err, 'fatal')
        logger.error(err)
    }
}