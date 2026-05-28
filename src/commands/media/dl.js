// src/commands/media/dl.js
// !dl — Universal Social Media Downloader
// Support: Instagram Reels/Post, TikTok, YouTube (audio), Facebook Video
// Alias: !download, !unduh, !reels, !tiktok, !yt, !ytmp3

import { download, detectPlatform } from '../../services/downloader/index.js'
import { extractUrl } from '../../services/downloader/detector.js'
import { formatBytes } from '../../services/downloader/utils.js'
import { downloadQueue } from '../../services/downloader/index.js'

// Platform emoji map untuk display
const PLATFORM_EMOJI = {
    instagram: '📸',
    tiktok: '🎵',
    youtube: '🎬',
    facebook: '📘',
}

const PLATFORM_NAME = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
}

export default {
    name: 'dl',
    aliases: ['download', 'unduh', 'reels', 'tiktok', 'tt', 'ytmp3', 'ig', 'fb'],
    category: 'media',
    description: 'Download video dari Instagram, TikTok, YouTube, Facebook.',
    usage: '!dl [link] | !ytmp3 [link] untuk audio',
    example: '!dl https://www.instagram.com/reel/xxx',
    cooldown: 10,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sock, chatId, msg, commandName } = ctx

        // ── 1. Ekstrak URL ─────────────────────────
        const rawInput = args.join(' ').trim()
        const url = extractUrl(rawInput) ?? (rawInput.startsWith('http') ? rawInput : null)

        if (!url) {
            return reply(
                `🔗 *Downloader*\n\n` +
                `Kirim link dari:\n` +
                `• 📸 Instagram (Reels/Post/IGTV)\n` +
                `• 🎵 TikTok (no watermark)\n` +
                `• 🎬 YouTube (!dl = video, !ytmp3 = audio)\n` +
                `• 📘 Facebook (Video/Reels)\n\n` +
                `*Cara pakai:*\n` +
                `!dl [link]\n\n` +
                `_Contoh: !dl https://instagram.com/reel/xxx_`
            )
        }

        // ── 2. Detect platform ─────────────────────
        const platform = detectPlatform(url)
        if (!platform) {
            return reply(
                `❌ Link tidak dikenali.\n\n` +
                `Pastikan link dari: Instagram, TikTok, YouTube, atau Facebook.`
            )
        }

        // ── 3. Queue status check ──────────────────
        const qStats = downloadQueue.stats
        if (qStats.pending >= 5) {
            return reply(`⏳ Antrian penuh (${qStats.pending} job). Coba lagi sebentar.`)
        }

        // ── 4. Determine format untuk YouTube ─────
        const options = {}
        if (platform === 'youtube') {
            // !ytmp3 atau !ytaudio → force audio
            options.format = ['ytmp3', 'ytaudio', 'mp3'].includes(commandName) ? 'audio' : 'audio'
            // Default YouTube ke audio karena video bisa sangat besar
        }

        // ── 5. Loading indicator ───────────────────
        await react('⏳')
        const emoji = PLATFORM_EMOJI[platform]
        const platformName = PLATFORM_NAME[platform]

        const loadingMsg = await reply(
            `${emoji} *Sedang download dari ${platformName}...*\n` +
            `_Mohon tunggu sebentar_`
        )

        // ── 6. Execute download ────────────────────
        try {
            const result = await download(url, options)

            // ── 7. Send media ──────────────────────
            await sendMedia(sock, chatId, msg, result)
            await react('✅')

            // Edit loading message jadi selesai
            // (Baileys tidak support edit, jadi kita delete dan kirim baru)
            // Note: delete loading msg kalau mau — opsional

        } catch (err) {
            await react('❌')

            // User-friendly error messages
            const errMsg = formatError(err.message, platform)
            await reply(`❌ *Gagal download*\n\n${errMsg}`)
        }
    }
}

// ─────────────────────────────────────────────
// SEND MEDIA — Route buffer ke tipe yang tepat
// ─────────────────────────────────────────────

async function sendMedia(sock, chatId, quotedMsg, result) {
    const { buffer, mimeType, caption, type, ext } = result

    const baseOpts = { quoted: quotedMsg }

    if (type === 'video' || mimeType?.startsWith('video/')) {
        await sock.sendMessage(chatId, {
            video: buffer,
            caption,
            mimetype: mimeType ?? 'video/mp4',
            fileName: result.filename,
        }, baseOpts)

    } else if (type === 'audio' || mimeType?.startsWith('audio/')) {
        await sock.sendMessage(chatId, {
            audio: buffer,
            caption,
            mimetype: mimeType ?? 'audio/mpeg',
            fileName: result.filename,
            ptt: false, // false = audio file, bukan voice note
        }, baseOpts)

    } else if (type === 'image' || mimeType?.startsWith('image/')) {
        await sock.sendMessage(chatId, {
            image: buffer,
            caption,
            mimetype: mimeType ?? 'image/jpeg',
            fileName: result.filename,
        }, baseOpts)

    } else {
        // Fallback: kirim sebagai dokumen
        await sock.sendMessage(chatId, {
            document: buffer,
            caption,
            mimetype: mimeType ?? 'application/octet-stream',
            fileName: result.filename,
        }, baseOpts)
    }
}

// ─────────────────────────────────────────────
// ERROR FORMATTER
// ─────────────────────────────────────────────

function formatError(message = '', platform = '') {
    // Timeout
    if (message.includes('Timeout') || message.includes('timeout')) {
        return `Koneksi timeout. Server mungkin lambat, coba lagi.`
    }

    // File terlalu besar
    if (message.includes('terlalu besar') || message.includes('MB')) {
        return `File terlalu besar untuk dikirim via WhatsApp (max 50MB).`
    }

    // Semua API gagal
    if (message.includes('Semua API')) {
        const tips = {
            instagram: `Pastikan:\n• Link bukan dari akun private\n• Link masih valid (tidak expired)`,
            tiktok: `Pastikan:\n• Link valid dan video masih ada\n• Coba copy link dari TikTok langsung`,
            youtube: `Pastikan:\n• Video tidak private/umur terbatas\n• Link valid`,
            facebook: `Pastikan:\n• Video bukan dari akun private\n• Link masih valid`,
        }
        return `${message}\n\n${tips[platform] ?? ''}`
    }

    return message
}