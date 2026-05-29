// src/handlers/message.js
// FIXED v2: prefix multi-support, mention detection robust, download media quoted fix

import { commands } from '../core/loader.js'
import { logger } from '../utils/logger.js'
import { aiService } from '../services/ai.js'
import { memoryService } from '../services/memory.js'
import { seamlessTracker } from '../services/seamless.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

// ─────────────────────────────────────────────
// JID UTILITIES
// ─────────────────────────────────────────────

function normalizeJid(jid = '') {
    if (!jid) return ''
    return jid.replace(/:\d+@/, '@').toLowerCase().trim()
}

function extractPhoneNumber(jid = '') {
    return normalizeJid(jid)
        .replace('@s.whatsapp.net', '')
        .replace('@g.us', '')
}

// ─────────────────────────────────────────────
// MENTION DETECTION
// 3-layer: exact match → phone prefix → body scan
// ─────────────────────────────────────────────

function isBotMentioned(mentionedJids = [], botJid = '', messageBody = '') {
    if (!botJid) return false

    const normalizedBot = normalizeJid(botJid)
    const botPhone = extractPhoneNumber(botJid)

    // Layer 1: exact match setelah normalize
    if (mentionedJids.map(normalizeJid).includes(normalizedBot)) return true

    // Layer 2: phone prefix match
    if (botPhone && mentionedJids.map(normalizeJid).some(j => j.startsWith(botPhone + '@'))) return true

    // Layer 3: body text scan (WhatsApp kadang tidak sertakan mentionedJid)
    if (botPhone && messageBody.includes('@' + botPhone)) return true

    return false
}

// Cek semua kemungkinan lokasi mentionedJid di message object Baileys
function extractMentionedJids(msg, messageContent) {
    const candidates = [
        messageContent?.extendedTextMessage?.contextInfo?.mentionedJid,
        messageContent?.contextInfo?.mentionedJid,
        messageContent?.imageMessage?.contextInfo?.mentionedJid,
        messageContent?.videoMessage?.contextInfo?.mentionedJid,
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid,
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid,
        msg.message?.viewOnceMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid,
    ]
    for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) return c
    }
    return []
}

// ─────────────────────────────────────────────
// PREFIX DETECTION
// Support: ! / . (configurable via env BOT_PREFIX)
// FIX: user pakai /groupinfo → harus terdeteksi sebagai command
// ─────────────────────────────────────────────

// Semua prefix yang valid — dari env + default fallback
function getValidPrefixes() {
    const envPrefix = process.env.BOT_PREFIX ?? '!'
    // Selalu include prefix dari env, tambah '/' sebagai universal prefix
    const set = new Set([envPrefix, '/'])
    return [...set]
}

function detectCommand(body = '') {
    const prefixes = getValidPrefixes()
    for (const prefix of prefixes) {
        if (body.startsWith(prefix)) {
            const withoutPrefix = body.slice(prefix.length).trim()
            if (withoutPrefix.length === 0) continue // prefix doang tanpa command
            const parts = withoutPrefix.split(/ +/)
            const commandName = parts.shift().toLowerCase()
            const args = parts
            return { isCommand: true, prefix, commandName, args }
        }
    }
    return { isCommand: false, prefix: null, commandName: null, args: [] }
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

export async function handleIncomingMessage(sock, { messages }) {
    try {
        const msg = messages[0]
        if (!msg?.message) return

        // ── 1. BOT JID ────────────────────────────────
        const rawBotId = sock.user?.id
            ?? (process.env.BOT_NUMBER?.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
            ?? ''
        const botJid = normalizeJid(rawBotId)

        // ── 2. BASIC INFO ─────────────────────────────
        const from = msg.key.remoteJid
        const isGroup = from?.endsWith('@g.us') ?? false
        const isDM = !isGroup && from?.endsWith('@s.whatsapp.net')
        const sender = isGroup ? (msg.key.participant ?? '') : from

        if (!from) return

        // ── 3. UNWRAP LAYERS ──────────────────────────
        const WRAPPERS = [
            'ephemeralMessage',
            'viewOnceMessage',
            'viewOnceMessageV2',
            'viewOnceMessageV2Extension',
            'documentWithCaptionMessage',
            'interactiveResponseMessage',
        ]

        let messageContent = msg.message
        let wrapDepth = 0
        while (wrapDepth < 3) {
            const baseType = Object.keys(messageContent ?? {})[0]
            if (!baseType || !WRAPPERS.includes(baseType)) break
            messageContent = messageContent[baseType]?.message ?? messageContent
            wrapDepth++
        }
        if (!messageContent) return

        const type = Object.keys(messageContent)[0]

        // ── 4. EXTRACT BODY ───────────────────────────
        const body =
            messageContent?.conversation
            ?? messageContent?.extendedTextMessage?.text
            ?? messageContent?.imageMessage?.caption
            ?? messageContent?.videoMessage?.caption
            ?? messageContent?.documentMessage?.caption
            ?? messageContent?.buttonsResponseMessage?.selectedDisplayText
            ?? messageContent?.listResponseMessage?.title
            ?? ''

        // ── 5. FILTER ─────────────────────────────────
        if (msg.key.fromMe) return
        // Allow media messages even without body (untuk !lihat dll)
        if (!body && !['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'].includes(type)) return

        // ── 6. COMMAND DETECTION ──────────────────────
        // FIX: deteksi prefix termasuk '/'
        const cmdResult = detectCommand(body)

        // ── 7. MENTION DETECTION ──────────────────────
        const mentionedJids = extractMentionedJids(msg, messageContent)
        const isMentionedInGroup = isGroup && isBotMentioned(mentionedJids, botJid, body)

        // Debug log untuk tracing mention issue
        if (isGroup) {
            logger.debug(`[MSG] from=${extractPhoneNumber(sender)} body="${body.slice(0, 40)}" isCmd=${cmdResult.isCommand} isMention=${isMentionedInGroup} mentionedJids=${JSON.stringify(mentionedJids)} botJid=${botJid}`)
        }

        // ── 8. SEAMLESS REPLY ─────────────────────────
        const quotedMsgId =
            messageContent?.extendedTextMessage?.contextInfo?.stanzaId
            ?? msg.message?.extendedTextMessage?.contextInfo?.stanzaId
            ?? null
        const isReplyToBot = seamlessTracker.isReplyToBot(quotedMsgId)

        // ── 9. DM TRIGGER ─────────────────────────────
        // Chat langsung ke bot tanpa prefix = AI
        const isDMTrigger = isDM && !cmdResult.isCommand && body.trim().length > 0

        // Strip mention dari body untuk AI prompt
        const bodyWithoutMention = body
            .replace(/@\d{5,20}/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim()

        // ── 10. HELPERS ───────────────────────────────

        const reply = async (text, options = {}) => {
            const sent = await sock.sendMessage(from, { text, ...options }, { quoted: msg })
            if (sent?.key?.id) seamlessTracker.track(sent.key.id)
            return sent
        }

        const react = async (emoji) => {
            try {
                await sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
            } catch (_) { /* non-critical */ }
        }

        const downloadMedia = async (targetMsg = msg) => {
            try {
                return await downloadMediaMessage(
                    targetMsg,
                    'buffer',
                    {},
                    { logger: console, reuploadRequest: sock.updateMediaMessage }
                )
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

        // ══════════════════════════════════════════════
        // ROUTING
        // ══════════════════════════════════════════════

        // ── ROUTE 1: COMMAND ──────────────────────────
        if (cmdResult.isCommand) {
            ctx.args = cmdResult.args
            ctx.commandName = cmdResult.commandName
            ctx.prefix = cmdResult.prefix

            logger.debug(`[Router] cmd="${cmdResult.commandName}" prefix="${cmdResult.prefix}" from=${extractPhoneNumber(sender)}`)

            const command = commands.get(cmdResult.commandName)
            if (!command) return // unknown command, silent ignore

            try {
                await command.execute(ctx)
            } catch (cmdErr) {
                logger.error(`[Command:${cmdResult.commandName}] ${cmdErr.message}`, cmdErr)
                await reply(`❌ Error di command *${cmdResult.commandName}*:\n${cmdErr.message}`)
            }
            return
        }

        // ── ROUTE 2: MENTION DI GRUP (Meta AI style) ─
        if (isMentionedInGroup) {
            if (!memoryService.isAiEnabled(from)) return

            if (!bodyWithoutMention) {
                // Di-tag tapi tidak ada pertanyaan
                await reply(
                    `👋 Halo! Mau nanya apa?\n` +
                    `_Contoh: @${extractPhoneNumber(rawBotId)} siapa presiden Indonesia?_`
                )
                return
            }

            logger.info(`[Mention] "${bodyWithoutMention.slice(0, 60)}" from=${extractPhoneNumber(sender)}`)
            await react('🤔')

            try {
                // Memory dipisah per sender agar tidak tercampur antar user di grup
                const aiCtx = isGroup ? `${from}::${sender}` : from
                const result = await aiService.chat(aiCtx, bodyWithoutMention)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                logger.error('[Mention] AI error:', err.message)
                await reply(`❌ AI lagi sibuk, coba lagi sebentar.`)
            }
            return
        }

        // ── ROUTE 3: SEAMLESS AI (reply ke pesan bot) ─
        if (isReplyToBot && body.trim()) {
            if (!memoryService.isAiEnabled(from)) return

            logger.info(`[Seamless] "${body.slice(0, 60)}"`)
            await react('🤔')

            try {
                const aiCtx = isGroup ? `${from}::${sender}` : from
                const result = await aiService.chat(aiCtx, body)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                logger.error('[Seamless] AI error:', err.message)
            }
            return
        }

        // ── ROUTE 4: DM TRIGGER ───────────────────────
        if (isDMTrigger) {
            if (!memoryService.isAiEnabled(from)) return

            logger.info(`[DM] "${body.slice(0, 60)}"`)
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
        // Jangan crash bot — log dan swallow
        logger.error('❌ Fatal error di message handler:', err.message, err.stack?.split('\n')[1])
    }
}