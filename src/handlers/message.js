// src/handlers/message.js
// FIXED: Robust mention detection, Meta AI-style @bot interaction
// FIXED: JID normalization, null-safe sock.user, multi-context mentionedJid extraction

import { commands } from '../core/loader.js'
import { logger } from '../utils/logger.js'
import { aiService } from '../services/ai.js'
import { memoryService } from '../services/memory.js'
import { seamlessTracker } from '../services/seamless.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

// ─────────────────────────────────────────────
// JID UTILITIES
// Baileys bisa return berbagai format JID tergantung versi:
//   628xxx:0@s.whatsapp.net
//   628xxx.0:XX@s.whatsapp.net
//   628xxx@s.whatsapp.net
// Normalize semua ke: 628xxx@s.whatsapp.net
// ─────────────────────────────────────────────

function normalizeJid(jid = '') {
    if (!jid) return ''
    return jid
        .replace(/:\d+@/, '@')      // hapus device suffix :0, :XX
        .replace(/\.\d+@/, '@')     // hapus format .0:XX
        .trim()
        .toLowerCase()
}

function extractPhoneNumber(jid = '') {
    return normalizeJid(jid).replace('@s.whatsapp.net', '').replace('@g.us', '')
}

/**
 * Cek apakah JID yang di-mention adalah bot.
 * 
 * Strategi multi-layer:
 * 1. Exact match setelah normalize kedua sisi
 * 2. Prefix match nomor HP (untuk edge case format aneh)
 * 3. Body text scan sebagai last resort
 */
function isBotMentioned(mentionedJids = [], botJid = '', messageBody = '') {
    if (!botJid) return false

    const normalizedBot = normalizeJid(botJid)
    const botPhone = extractPhoneNumber(botJid)

    // Layer 1: Exact normalize match
    const normalizedMentions = mentionedJids.map(normalizeJid)
    if (normalizedMentions.includes(normalizedBot)) return true

    // Layer 2: Phone number prefix match (kalau format JID masih aneh)
    if (botPhone && normalizedMentions.some(j => j.startsWith(botPhone + '@'))) return true

    // Layer 3: Body text scan — kalau @62xxx ada di body dan cocok dengan nomor bot
    // WhatsApp kadang tidak include mentionedJid untuk format tertentu
    if (botPhone && messageBody.includes('@' + botPhone)) return true

    return false
}

/**
 * Extract mentionedJid dari berbagai kemungkinan lokasi di message object.
 * WhatsApp/Baileys menyimpan di lokasi berbeda tergantung tipe pesan.
 */
function extractMentionedJids(msg, messageContent) {
    const candidates = [
        // Path paling umum
        messageContent?.extendedTextMessage?.contextInfo?.mentionedJid,
        // Kadang ada di level atas messageContent
        messageContent?.contextInfo?.mentionedJid,
        // Kalau pesan adalah image dengan caption
        messageContent?.imageMessage?.contextInfo?.mentionedJid,
        messageContent?.videoMessage?.contextInfo?.mentionedJid,
        // Raw message level (sebelum unwrap)
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid,
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid,
    ]

    for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length > 0) {
            return candidate
        }
    }

    return []
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

export async function handleIncomingMessage(sock, { messages }) {
    try {
        const msg = messages[0]
        if (!msg?.message) return

        // ── 1. RESOLVE BOT JID ────────────────────────
        // Baca dari sock.user dengan null-safe fallback ke env
        const rawBotId = sock.user?.id
            ?? process.env.BOT_NUMBER?.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
            ?? ''
        const botJid = normalizeJid(rawBotId)

        // ── 2. BASIC MESSAGE INFO ─────────────────────
        const from = msg.key.remoteJid
        const isGroup = from?.endsWith('@g.us') ?? false
        const isDM = !isGroup && from?.endsWith('@s.whatsapp.net')
        const sender = isGroup ? (msg.key.participant ?? '') : from

        // ── 3. UNWRAP MESSAGE LAYERS ──────────────────
        // Ephemeral, viewonce, documentWithCaption semua dibuka
        let messageContent = msg.message
        const WRAPPER_TYPES = [
            'ephemeralMessage',
            'viewOnceMessage',
            'viewOnceMessageV2',
            'viewOnceMessageV2Extension',
            'documentWithCaptionMessage',
            'interactiveResponseMessage',
        ]

        let wrapDepth = 0 // anti infinite loop
        while (wrapDepth < 3) {
            const baseType = Object.keys(messageContent ?? {})[0]
            if (!baseType || !WRAPPER_TYPES.includes(baseType)) break
            messageContent = messageContent[baseType]?.message ?? messageContent
            wrapDepth++
        }

        if (!messageContent) return

        const type = Object.keys(messageContent)[0]

        // Extract body dari semua kemungkinan lokasi
        const body =
            messageContent?.conversation
            || messageContent?.extendedTextMessage?.text
            || messageContent?.imageMessage?.caption
            || messageContent?.videoMessage?.caption
            || messageContent?.documentMessage?.caption
            || messageContent?.buttonsResponseMessage?.selectedDisplayText
            || messageContent?.listResponseMessage?.title
            || ''

        // ── 4. FILTERS ────────────────────────────────
        if (msg.key.fromMe) return  // abaikan pesan dari bot sendiri
        if (!body && !['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) return

        // ── 5. MENTION DETECTION (FIXED) ─────────────
        const mentionedJids = extractMentionedJids(msg, messageContent)
        const isMentionedInGroup = isGroup && isBotMentioned(mentionedJids, botJid, body)

        // Log untuk debugging mention issues
        if (isGroup && mentionedJids.length > 0) {
            logger.debug('[Mention] mentionedJids raw:', mentionedJids)
            logger.debug('[Mention] botJid normalized:', botJid)
            logger.debug('[Mention] isBotMentioned:', isMentionedInGroup)
        }

        // ── 6. CONTEXT VARIABLES ─────────────────────
        const prefix = process.env.BOT_PREFIX || '!'
        const isCommand = body.startsWith(prefix)

        // Reply ke pesan yang dikirim bot → seamless AI
        const quotedMsgId = messageContent?.extendedTextMessage?.contextInfo?.stanzaId
            ?? msg.message?.extendedTextMessage?.contextInfo?.stanzaId
            ?? null
        const isReplyToBot = seamlessTracker.isReplyToBot(quotedMsgId)

        // DM trigger: chat langsung ke bot tanpa prefix = AI
        const isDMTrigger = isDM && !isCommand && body.trim().length > 0

        // Strip mention dari body untuk prompt bersih
        // @628xxx → '' tapi juga handle @0 format (WhatsApp kadang encode begini)
        const bodyWithoutMention = body
            .replace(/@\d{5,20}/g, '')  // strip @628xxx (5-20 digit)
            .replace(/\s{2,}/g, ' ')
            .trim()

        // Bot JID mention
        const botJidMentionString = sock.user?.id ?? ''

        // ── 7. HELPERS ────────────────────────────────

        const reply = async (text, options = {}) => {
            const sent = await sock.sendMessage(from, { text, ...options }, { quoted: msg })
            if (sent?.key?.id) seamlessTracker.track(sent.key.id)
            return sent
        }

        const react = async (emoji) => {
            try {
                await sock.sendMessage(from, {
                    react: { text: emoji, key: msg.key }
                })
            } catch (_) { /* react bukan critical */ }
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

        // ── 8. ROUTING ────────────────────────────────

        // ROUTE 1: COMMAND (prefix)
        if (isCommand) {
            const rawArgs = body.slice(prefix.length).trim().split(/ +/)
            const commandName = rawArgs.shift().toLowerCase()

            ctx.args = rawArgs
            ctx.commandName = commandName

            logger.debug(`[Router] Command: "${commandName}" from ${sender}`)
            const command = commands.get(commandName)

            if (!command) return  // silently ignore unknown commands

            try {
                await command.execute(ctx)
            } catch (cmdErr) {
                logger.error(`[Command] Error in ${commandName}:`, cmdErr.message)
                await reply(`❌ Error: ${cmdErr.message}`)
            }
            return
        }

        // ROUTE 2: MENTION DI GRUP — @bot [pertanyaan] (Meta AI style)
        if (isMentionedInGroup) {
            if (!memoryService.isAiEnabled(from)) return

            // Kalau mention tapi tidak ada pertanyaan, kasih prompt
            if (!bodyWithoutMention) {
                await reply(
                    `👋 Halo! Ada yang bisa aku bantu? Mention aku lagi dengan pertanyaanmu.\n` +
                    `_Contoh: @${extractPhoneNumber(botJid)} siapa pencipta WhatsApp?_`
                )
                return
            }

            logger.info(`[Mention] "${bodyWithoutMention.slice(0, 60)}" from ${sender}`)
            await react('🤔')

            try {
                // Gunakan chatId grup sebagai context, tapi pisahkan per sender
                // supaya memory grup tidak tercampur antar user
                const aiContextId = `${from}::${sender}`
                const result = await aiService.chat(aiContextId, bodyWithoutMention)
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

        // ROUTE 3: SEAMLESS AI — reply ke pesan bot
        if (isReplyToBot && body.trim()) {
            if (!memoryService.isAiEnabled(from)) return

            logger.info(`[Seamless] "${body.slice(0, 60)}" from ${sender}`)
            await react('🤔')

            try {
                // Di grup: pakai context per sender, di DM: pakai chatId
                const aiContextId = isGroup ? `${from}::${sender}` : from
                const result = await aiService.chat(aiContextId, body)
                const sent = await reply(result.text)
                if (sent?.key?.id) seamlessTracker.track(sent.key.id)
                await react('✅')
            } catch (err) {
                await react('❌')
                logger.error('[Seamless] AI error:', err.message)
            }
            return
        }

        // ROUTE 4: DM TRIGGER — chat langsung ke bot
        if (isDMTrigger) {
            if (!memoryService.isAiEnabled(from)) return

            logger.info(`[DM] "${body.slice(0, 60)}" from ${sender}`)
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
        logger.error('❌ Fatal error di message handler:', err)
        // Jangan crash bot — swallow error
    }
}