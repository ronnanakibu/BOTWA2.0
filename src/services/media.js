// src/services/media.js
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { logger } from '../utils/logger.js'

const EMOJI_CACHE_DIR = path.resolve('./storage/media/emoji-cache')
const NOTO_BASE = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/png/128'

function emojiToCodepoint(emoji) {
    const codepoints = []
    const chars = [...emoji]
    for (let i = 0; i < chars.length; i++) {
        const cp = chars[i].codePointAt(0)
        if (cp === 0xFE0F) continue
        codepoints.push(cp.toString(16))
    }
    return 'emoji_u' + codepoints.join('_')
}

async function fetchEmojiPng(emoji) {
    if (!fs.existsSync(EMOJI_CACHE_DIR)) {
        fs.mkdirSync(EMOJI_CACHE_DIR, { recursive: true })
    }

    const cp = emojiToCodepoint(emoji)
    const cachePath = path.join(EMOJI_CACHE_DIR, `${cp}.png`)

    if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 100) {
        return cachePath
    }

    const url = `${NOTO_BASE}/${cp}.png`

    return new Promise((resolve) => {
        const file = fs.createWriteStream(cachePath)
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close()
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

function pngToDataUri(filePath) {
    const buf = fs.readFileSync(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
}

function detectEmojis(text) {
    const matches = [...text.matchAll(
        /\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?(\u200D\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?)*\uFE0F?/gu
    )]
    return [...new Set(matches.map(m => m[0]))]
}

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
            // Skip
        }
    }))

    return map
}

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

            fs.writeFileSync(config, configFile, 'utf8')
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig ready → ${fontDir}`)
        } catch (e) {
            console.error('❌ [MediaService] Fontconfig init gagal:', e.message)
        }
    }

    #tokenize(text) {
        return [...text.matchAll(
            /\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?(\u200D\p{Emoji_Presentation})*\uFE0F?|\S+|\s+/gu
        )].map(m => m[0])
    }

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
        return str
            .replace(/\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?(\u200D\p{Emoji_Presentation})*\uFE0F?/gu, '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .trim()
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

        // Kembalikan koordinat Y aman lantai dasar meme ke 485px (Rata Tengah)
        const startY = isBottom
            ? 485 - ((lines.length - 1) * lineSpacing)
            : fontSize + 20

        return { lines, fontSize, startY, lineSpacing }
    }

    // ─────────────────────────────────────────────
    // CORE INLINE SVG RENDERER (THE MAGIC HAPPENS HERE)
    // ─────────────────────────────────────────────

    #renderLine(line, y, fontSize, opts) {
        const {
            x = 25,
            textAnchor = 'start', // Default start untuk brat, middle untuk meme
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
        const emojiSize = fontSize * 1.05
        let elements = ''

        const emojisInLine = tokens.filter(t => detectEmojis(t).length > 0)
        const hasEmoji = emojisInLine.length > 0

        // Ambil hanya komponen teks murni
        const textOnly = tokens.filter(t => !detectEmojis(t).length).join(' ').trim()
        const safeText = this.#escapeXml(textOnly)
        const strokeAttr = stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"` : ''

        if (!hasEmoji) {
            // JALUR 1: PURE TEXT (BRAT/MEME NORMAL)
            const justifyAttr = (justify && !isLast) ? `textLength="${justifyWidth}" lengthAdjust="spacing"` : ''

            elements += `
            <text x="${x}" y="${y}"
                text-anchor="${textAnchor}"
                font-family="${fontFamily}"
                font-weight="${fontWeight}"
                font-size="${fontSize}px"
                fill="${fill}"
                letter-spacing="${letterSpacing}"
                ${strokeAttr}
                ${justifyAttr}>${safeText}</text>\n`
        } else {
            // JALUR 2: MIXED TEXT + EMOJI INLINE (ANTI-RENGGANG & SUPPORT JUSTIFY)
            const emojiY = y - emojiSize * 0.84

            if (textAnchor === 'middle') {
                // A. KASUS STIKER MEME (Rata Tengah + Ada Emoji)
                // Kita biarkan text-anchor middle mengurus penempatan teks, emoji di-overlay di posisi kanan teks
                elements += `
                <text x="${x}" y="${y}"
                    text-anchor="middle"
                    font-family="${fontFamily}"
                    font-weight="${fontWeight}"
                    font-size="${fontSize}px"
                    fill="${fill}"
                    ${strokeAttr}>${safeText}</text>\n`

                // Estimasi offset tengah agar emoji nempel pas setelah kata berakhir
                const estTextWidth = [...safeText].length * fontSize * 0.48
                let emojiX = x + (estTextWidth / 2) + 10

                emojisInLine.forEach(emoji => {
                    const dataUri = emojiMap.get(emoji.trim()) ?? emojiMap.get(detectEmojis(emoji)[0])
                    if (dataUri) {
                        elements += `<image href="${dataUri}" x="${emojiX}" y="${emojiY}" width="${emojiSize}" height="${emojiSize}"/>\n`
                        emojiX += emojiSize * 1.05
                    }
                })
            } else {
                // B. KASUS BRAT/ANOMALI (Rata Kiri + Justify Paksa Kata + Kunci Emoji di Ujung Kanan Margin)
                // Biar kata terakhir "sih" ketarik ke ujung kanan mepet emoji, kita WAJIB nyalakan textLength di baris ini!
                const justifyAttr = justify ? `textLength="${justifyWidth - (emojisInLine.length * (emojiSize * 0.9))}" lengthAdjust="spacing"` : ''

                elements += `
                <text x="${x}" y="${y}"
                    text-anchor="start"
                    font-family="${fontFamily}"
                    font-weight="${fontWeight}"
                    font-size="${fontSize}px"
                    fill="${fill}"
                    letter-spacing="${letterSpacing}"
                    ${justifyAttr}>${safeText}</text>\n`

                // Kunci posisi koordinat X Emoji mutlak nempel di batas margin kanan (472px + offset x)
                let emojiX = x + justifyWidth - (emojisInLine.length * emojiSize * 0.95)

                emojisInLine.forEach(emoji => {
                    const dataUri = emojiMap.get(emoji.trim()) ?? emojiMap.get(detectEmojis(emoji)[0])
                    if (dataUri) {
                        elements += `<image href="${dataUri}" x="${emojiX}" y="${emojiY}" width="${emojiSize}" height="${emojiSize}"/>\n`
                        emojiX += emojiSize * 0.95
                    }
                })
            }
        }

        return elements
    }

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────

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

            const emojiMap = await prepareEmojiMap(cleanText)

            let svgContent = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)
                const isLast = i === lines.length - 1

                svgContent += this.#renderLine(line, y, fontSize, {
                    x: 25,
                    textAnchor: 'start',
                    fontFamily: "'Arial Narrow', Arial, sans-serif",
                    fontWeight: 'normal',
                    fill: '#000000',
                    emojiMap,
                    justify: true, // Tetap jalankan perhitungan justify biner
                    justifyWidth: 465, // Jarak rentang optimal margin kanan brat
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

    async toMemeSticker(bufferImage, topText = '', bottomText = '') {
        try {
            const cleanTop = topText.trim().toUpperCase()
            const cleanBottom = bottomText.trim().toUpperCase()

            const topData = this.#processTextAdaptive(cleanTop, false)
            const bottomData = this.#processTextAdaptive(cleanBottom, true)

            const emojiMap = await prepareEmojiMap(cleanTop + ' ' + cleanBottom)

            let svgContent = ''

            // 🌟 FIX TOTAL MEME STICKER: Kembalikan textAnchor ke 'middle' & matikan justify (justify: false)
            topData.lines.forEach((line, i) => {
                const y = topData.startY + (i * topData.lineSpacing)
                const isLast = i === topData.lines.length - 1
                svgContent += this.#renderLine(line, y, topData.fontSize, {
                    x: 256,  // Center Kanvas 512/2
                    textAnchor: 'middle',
                    fontFamily: "Impact, 'Arial Narrow', sans-serif",
                    fontWeight: 'bold',
                    fill: 'white',
                    stroke: 'black',
                    strokeWidth: topData.fontSize > 60 ? '8' : '5',
                    emojiMap,
                    justify: false, // Matikan paksaan melar rata kanan-kiri
                    isLast,
                    letterSpacing: '0px'
                })
            })

            bottomData.lines.forEach((line, i) => {
                const y = bottomData.startY + (i * bottomData.lineSpacing)
                const isLast = i === bottomData.lines.length - 1
                svgContent += this.#renderLine(line, y, bottomData.fontSize, {
                    x: 256,  // Center Kanvas 512/2
                    textAnchor: 'middle',
                    fontFamily: "Impact, 'Arial Narrow', sans-serif",
                    fontWeight: 'bold',
                    fill: 'white',
                    stroke: 'black',
                    strokeWidth: bottomData.fontSize > 60 ? '8' : '5',
                    emojiMap,
                    justify: false, // Matikan paksaan melar rata kanan-kiri
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