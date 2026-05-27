// src/services/media.js
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { logger } from '../utils/logger.js'

// ─────────────────────────────────────────────
// EMOJI RESOLVER
// Noto Emoji (Google) CDN → cache lokal → inject sebagai <image> di SVG
// Ini satu-satunya cara yang reliable di librsvg (sharp)
// karena librsvg tidak bisa render emoji dari font
// ─────────────────────────────────────────────

const EMOJI_CACHE_DIR = path.resolve('./storage/media/emoji-cache')

// Google Noto Emoji — rounded modern style, 128px for better quality
const NOTO_BASE = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/png/128'

/**
 * Konversi emoji character ke codepoint hex (format Noto Emoji).
 * Contoh: 😂 → 'emoji_u1f602'
 * Support emoji ZWJ sequence & variation selector.
 */
function emojiToCodepoint(emoji) {
    const codepoints = []
    const chars = [...emoji]
    for (let i = 0; i < chars.length; i++) {
        const cp = chars[i].codePointAt(0)
        // Skip variation selector (U+FE0F) — Noto tidak pakai ini di filename
        if (cp === 0xFE0F) continue
        codepoints.push(cp.toString(16))
    }
    return 'emoji_u' + codepoints.join('_')
}

/**
 * Download emoji PNG dari Noto Emoji (Google) ke cache lokal.
 * Return path file lokal, atau null kalau gagal.
 */
async function fetchEmojiPng(emoji) {
    if (!fs.existsSync(EMOJI_CACHE_DIR)) {
        fs.mkdirSync(EMOJI_CACHE_DIR, { recursive: true })
    }

    const cp = emojiToCodepoint(emoji)
    const cachePath = path.join(EMOJI_CACHE_DIR, `${cp}.png`)

    // Sudah di-cache
    if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 100) {
        return cachePath
    }

    const url = `${NOTO_BASE}/${cp}.png`

    return new Promise((resolve) => {
        const file = fs.createWriteStream(cachePath)
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close()
                // Simple redirect follow
                https.get(res.headers.location, (res2) => {
                    res2.pipe(file)
                    file.on('finish', () => { file.close(); resolve(cachePath) })
                }).on('error', () => { fs.unlink(cachePath, () => { }); resolve(null) })
                return
            }
            if (res.statusCode !== 200) {
                file.close()
                fs.unlink(cachePath, () => { })
                resolve(null)
                return
            }
            res.pipe(file)
            file.on('finish', () => { file.close(); resolve(cachePath) })
        }).on('error', () => {
            fs.unlink(cachePath, () => { })
            resolve(null)
        })
    })
}

/**
 * Encode file PNG ke base64 data URI untuk embed di SVG.
 */
function pngToDataUri(filePath) {
    const buf = fs.readFileSync(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
}

/**
 * Deteksi semua emoji dalam string.
 * Return array of unique emoji characters.
 */
function detectEmojis(text) {
    const matches = [...text.matchAll(
        /\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?(\u200D\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?)*\uFE0F?/gu
    )]
    return [...new Set(matches.map(m => m[0]))]
}

/**
 * Pre-fetch semua emoji yang ada di text ke cache lokal.
 * Return Map<emoji, dataUri> untuk dipakai saat render SVG.
 */
async function prepareEmojiMap(text) {
    const emojis = detectEmojis(text)
    const map = new Map()

    await Promise.all(emojis.map(async (emoji) => {
        try {
            const filePath = await fetchEmojiPng(emoji)
            if (filePath) {
                map.set(emoji, pngToDataUri(filePath))
            }
        } catch (e) {
            // Gagal fetch — emoji akan di-skip saat render
        }
    }))

    return map
}

// ─────────────────────────────────────────────
// MEDIASERVICE
// ─────────────────────────────────────────────

class MediaService {
    constructor() {
        this.#initFontconfig()
    }

    #initFontconfig() {
        try {
            const configDir = path.resolve('./storage/database')
            const fontDir = path.resolve('./src/assets/fonts')
            const cacheDir = path.resolve('./storage/database/fontcache')
            const configFile = path.join(configDir, 'fonts.conf')

            if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
            if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true })
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

            const config = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
    <dir>${fontDir}</dir>
    <dir>/usr/share/fonts</dir>
    <dir>/usr/local/share/fonts</dir>
    <cachedir>${cacheDir}</cachedir>
</fontconfig>`

            fs.writeFileSync(configFile, config, 'utf8')
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig ready → ${fontDir}`)
        } catch (e) {
            console.error('❌ [MediaService] Fontconfig init gagal:', e.message)
        }
    }

    // ─────────────────────────────────────────────
    // TEXT HELPERS
    // ─────────────────────────────────────────────

    /**
     * Tokenisasi teks menjadi array token.
     * Emoji dipertahankan sebagai satu token utuh.
     * Spasi antar kata menjadi token ' '.
     */
    #tokenize(text) {
        return [...text.matchAll(
            /\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?(\u200D\p{Emoji_Presentation})*\uFE0F?|\S+|\s+/gu
        )].map(m => m[0])
    }

    /**
     * Word-wrap dengan dukungan emoji sebagai token lebar.
     * Emoji dihitung sebagai 2 karakter visual.
     */
    #wrapText(text, maxCharsPerLine = 11) {
        const words = this.#tokenize(text).filter(t => t.trim())
        const visualLen = str => [...str].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2000 ? 2 : 1), 0)

        let lines = []
        let currentLine = ''

        words.forEach(word => {
            const wLen = visualLen(word)
            const lineLen = visualLen(currentLine)

            if (wLen > maxCharsPerLine) {
                if (currentLine.trim()) lines.push(currentLine.trim())
                lines.push(word)
                currentLine = ''
                return
            }
            if (lineLen + wLen > maxCharsPerLine) {
                if (currentLine.trim()) lines.push(currentLine.trim())
                currentLine = word + ' '
            } else {
                currentLine += word + ' '
            }
        })
        if (currentLine.trim()) lines.push(currentLine.trim())
        return lines
    }

    #escapeXml(str) {
        // Strip emoji dari teks — emoji akan dirender sebagai <image> terpisah
        return str
            .replace(/\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?(\u200D\p{Emoji_Presentation})*\uFE0F?/gu, '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .trim()
    }

    /**
     * Render satu baris teks + emoji inline sebagai SVG elements.
     * Teks di-render sebagai <text>, emoji sebagai <image> PNG.
     *
     * @param {string} line - teks baris (bisa ada emoji)
     * @param {number} y - posisi Y baseline
     * @param {number} fontSize - ukuran font
     * @param {object} opts - { x, textAnchor, fontFamily, fontWeight, fill, stroke, strokeWidth, emojiMap, justify, justifyWidth, isLast }
     */
    #renderLine(line, y, fontSize, opts) {
        const {
            x = 25,
            fontFamily = "'Arial Narrow', Arial, sans-serif",
            fontWeight = 'normal',
            fill = '#000000',
            stroke = null,
            strokeWidth = '0',
            emojiMap = new Map(),
            justify = false,
            justifyWidth = 472,
            isLast = true,
            letterSpacing = '-2px'
        } = opts

        const tokens = this.#tokenize(line)
        const emojiSize = fontSize * 1.1  // Emoji sedikit lebih besar dari cap height
        let elements = ''

        // Pisahkan token jadi segmen teks dan segmen emoji
        // lalu render dalam <tspan> + <image> berurutan
        // Untuk Brat style: pakai SVG <text> dengan tspan per segmen
        // Untuk justify: kalau bukan baris terakhir, pakai textLength

        // Cek apakah baris ini punya emoji
        const hasEmoji = tokens.some(t => emojiMap.has(t.trim()) || detectEmojis(t).length > 0)

        if (!hasEmoji) {
            // Pure teks — render normal dengan justify kalau perlu
            const safeText = this.#escapeXml(line)
            const justifyAttr = (justify && !isLast) ? `textLength="${justifyWidth}" lengthAdjust="spacing"` : ''
            const strokeAttr = stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"` : ''

            elements += `<text x="${x}" y="${y}"
                font-family="${fontFamily}"
                font-weight="${fontWeight}"
                font-size="${fontSize}px"
                fill="${fill}"
                letter-spacing="${letterSpacing}"
                ${strokeAttr}
                ${justifyAttr}>${safeText}</text>\n`
        } else {
            // Mixed teks + emoji — render dengan pendekatan hybrid:
            // Teks sebagai <text>, emoji sebagai <image> yang di-overlap
            // Karena SVG librsvg tidak support inline emoji font,
            // kita render teks dulu (tanpa emoji), lalu overlay emoji di posisi akhir baris

            // Hitung berapa token teks vs emoji
            const textOnly = tokens.filter(t => !detectEmojis(t).length).join(' ').trim()
            const emojisInLine = tokens.filter(t => detectEmojis(t).length > 0)

            // Render teks (tanpa emoji)
            const safeText = this.#escapeXml(textOnly)
            // Untuk baris dengan emoji, skip justify (terlalu kompleks untuk mixed)
            const strokeAttr = stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"` : ''

            if (safeText) {
                elements += `<text x="${x}" y="${y}"
                    font-family="${fontFamily}"
                    font-weight="${fontWeight}"
                    font-size="${fontSize}px"
                    fill="${fill}"
                    letter-spacing="${letterSpacing}"
                    ${strokeAttr}>${safeText}</text>\n`
            }

            // Overlay emoji di akhir baris (kanan kanvas atau posisi estimasi)
            // Estimasi lebar teks: avg char width = fontSize * 0.55
            const textWidth = [...textOnly].length * fontSize * 0.52
            let emojiX = x + textWidth + (safeText ? fontSize * 0.2 : 0)
            const emojiY = y - emojiSize * 0.85  // Align top dengan cap height

            emojisInLine.forEach(emoji => {
                const dataUri = emojiMap.get(emoji.trim()) ?? emojiMap.get(detectEmojis(emoji)[0])
                if (dataUri) {
                    elements += `<image
                        href="${dataUri}"
                        x="${emojiX}"
                        y="${emojiY}"
                        width="${emojiSize}"
                        height="${emojiSize}"/>\n`
                    emojiX += emojiSize * 1.1
                }
            })
        }

        return elements
    }

    #processTextAdaptive(text, isBottom = false) {
        if (!text) return { lines: [], fontSize: 80, startY: 0, lineSpacing: 0 }

        const words = text.trim().split(/\s+/)
        let lines = []

        if (text.length > 15 && words.length > 1) {
            const mid = Math.ceil(words.length / 2)
            lines.push(words.slice(0, mid).join(' '))
            lines.push(words.slice(mid).join(' '))
        } else {
            lines.push(text)
        }

        const maxLineLength = Math.max(...lines.map(l => l.length))
        let fontSize = Math.floor(490 / (maxLineLength * 0.55))
        fontSize = Math.max(35, Math.min(85, fontSize))

        const lineSpacing = fontSize * 1.05
        const startY = isBottom
            ? 492 - ((lines.length - 1) * lineSpacing)
            : fontSize + 20

        return { lines, fontSize, startY, lineSpacing }
    }

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────

    /**
     * Stiker teks Brat/anomali.
     * Background putih, font hitam lowercase, justify penuh.
     * Emoji di-render sebagai Noto Emoji PNG (inline di SVG).
     */
    async toQuoteSticker(rawText) {
        try {
            const cleanText = rawText.trim().toLowerCase()
            const lines = this.#wrapText(cleanText, 11)

            let fontSize = 105
            if (lines.length > 3) fontSize = 82
            if (lines.length > 5) fontSize = 64
            if (lines.length > 8) fontSize = 46

            const lineSpacing = fontSize * 1.05
            const startY = 90

            // Pre-fetch semua emoji yang ada di text
            const emojiMap = await prepareEmojiMap(cleanText)

            let svgContent = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)
                const isLast = i === lines.length - 1
                svgContent += this.#renderLine(line, y, fontSize, {
                    x: 25,
                    fontFamily: "'Arial Narrow', Arial, sans-serif",
                    fontWeight: 'normal',
                    fill: '#000000',
                    emojiMap,
                    justify: true,
                    justifyWidth: 472,
                    isLast,
                    letterSpacing: '-2px'
                })
            })

            const svg = Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                ${svgContent}
            </svg>`)

            return await sharp({
                create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
            })
                .composite([{ input: svg, top: 0, left: 0 }])
                .webp({ quality: 95 })
                .toBuffer()

        } catch (e) {
            logger.error('❌ toQuoteSticker error:', e.message)
            throw new Error('Gagal meracik stiker brat.')
        }
    }

    /**
     * Stiker meme dari gambar + teks atas/bawah Impact style.
     * Emoji di-render sebagai Noto Emoji PNG (inline di SVG).
     */
    async toMemeSticker(bufferImage, topText = '', bottomText = '') {
        try {
            const cleanTop = topText.trim().toUpperCase()
            const cleanBottom = bottomText.trim().toUpperCase()

            const topData = this.#processTextAdaptive(cleanTop, false)
            const bottomData = this.#processTextAdaptive(cleanBottom, true)

            // Pre-fetch emoji dari kedua teks
            const emojiMap = await prepareEmojiMap(cleanTop + ' ' + cleanBottom)

            let svgContent = ''

            // Render top text
            topData.lines.forEach((line, i) => {
                const y = topData.startY + (i * topData.lineSpacing)
                const isLast = i === topData.lines.length - 1
                svgContent += this.#renderLine(line, y, topData.fontSize, {
                    x: 256,  // center (text-anchor middle)
                    fontFamily: "Impact, 'Arial Narrow', sans-serif",
                    fontWeight: 'bold',
                    fill: 'white',
                    stroke: 'black',
                    strokeWidth: topData.fontSize > 60 ? '8' : '5',
                    emojiMap,
                    justify: true,
                    justifyWidth: 490,
                    isLast,
                    letterSpacing: '0px'
                })
            })

            // Render bottom text
            bottomData.lines.forEach((line, i) => {
                const y = bottomData.startY + (i * bottomData.lineSpacing)
                const isLast = i === bottomData.lines.length - 1
                svgContent += this.#renderLine(line, y, bottomData.fontSize, {
                    x: 256,
                    fontFamily: "Impact, 'Arial Narrow', sans-serif",
                    fontWeight: 'bold',
                    fill: 'white',
                    stroke: 'black',
                    strokeWidth: bottomData.fontSize > 60 ? '8' : '5',
                    emojiMap,
                    justify: true,
                    justifyWidth: 490,
                    isLast,
                    letterSpacing: '0px'
                })
            })

            const svg = Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                ${svgContent}
            </svg>`)

            return await sharp(bufferImage)
                .resize(512, 512, { fit: 'cover', position: 'center' })
                .composite([{ input: svg, top: 0, left: 0 }])
                .webp({ quality: 85 })
                .toBuffer()

        } catch (e) {
            logger.error('❌ toMemeSticker error:', e.message)
            throw new Error('Gagal memproses stiker meme.')
        }
    }
}

export default new MediaService()