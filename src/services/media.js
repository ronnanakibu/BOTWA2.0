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
    if (!fs.existsSync(EMOJI_CACHE_DIR)) fs.mkdirSync(EMOJI_CACHE_DIR, { recursive: true })
    const cp = emojiToCodepoint(emoji)
    const cachePath = path.join(EMOJI_CACHE_DIR, `${cp}.png`)

    if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 100) return cachePath
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

const EMOJI_REGEX = /\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?(\u200D\p{Emoji_Presentation}\p{Emoji_Modifier_Base}?\p{Emoji_Modifier}?)*\uFE0F?/gu;

function detectEmojis(text) {
    const matches = [...text.matchAll(EMOJI_REGEX)]
    return [...new Set(matches.map(m => m[0]))]
}

async function prepareEmojiMap(text) {
    const emojis = detectEmojis(text)
    const map = new Map()
    await Promise.all(emojis.map(async (emoji) => {
        try {
            const filePath = await fetchEmojiPng(emoji)
            if (filePath) map.set(emoji, pngToDataUri(filePath))
        } catch (e) { }
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

            fs.writeFileSync(configFile, config, 'utf8')
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig ready → ${fontDir}`)
        } catch (e) {
            console.error('❌ [MediaService] Fontconfig init gagal:', e.message)
        }
    }

    #wrapText(text, maxCharsPerLine = 11) {
        // Trik injeksi spasi: pisahkan paksa emoji dari kata agar tidak menyatu
        const spaced = text.replace(EMOJI_REGEX, (m) => ` ${m} `)
        const tokens = spaced.trim().split(/\s+/).filter(Boolean)
        const visualLen = str => [...str].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2000 ? 2 : 1), 0)

        let lines = []
        let currentLine = ''

        tokens.forEach(word => {
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
        const startY = isBottom
            ? 485 - ((lines.length - 1) * lineSpacing)
            : fontSize + 20

        return { lines, fontSize, startY, lineSpacing }
    }

    // ─────────────────────────────────────────────
    // CORE INLINE SVG RENDERER (MANUAL VECTOR PLOTTING ENGINE)
    // ─────────────────────────────────────────────

    #renderLine(line, y, fontSize, opts) {
        const {
            x = 25,
            textAnchor = 'start', // Start = Brat, Middle = Meme
            fontFamily = "'Arial Narrow', Arial, sans-serif",
            fontWeight = 'normal',
            fill = '#000000',
            stroke = null,
            strokeWidth = '0',
            emojiMap = new Map(),
            letterSpacing = '-2px'
        } = opts

        // Pisahkan kalimat jadi per kata/emoji mutlak
        const spaced = line.replace(EMOJI_REGEX, (m) => ` ${m} `)
        const tokens = spaced.trim().split(/\s+/).filter(Boolean)

        let elements = ''
        const strokeAttr = stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"` : ''

        // 🌟 JALUR 1: STIKER MEME (RATA TENGAH NORMAL)
        if (textAnchor === 'middle') {
            const textOnly = tokens.filter(t => detectEmojis(t).length === 0).join(' ').trim()
            const emojisInLine = tokens.filter(t => detectEmojis(t).length > 0)
            const safeText = this.#escapeXml(textOnly)

            elements += `
            <text x="${x}" y="${y}"
                text-anchor="middle"
                font-family="${fontFamily}"
                font-weight="${fontWeight}"
                font-size="${fontSize}px"
                fill="${fill}"
                ${strokeAttr}>${safeText}</text>\n`

            const emojiSize = fontSize * 1.05
            const estTextWidth = [...safeText].length * fontSize * 0.52
            let emojiX = x + (estTextWidth / 2) + 10
            const emojiY = y - emojiSize * 0.84

            emojisInLine.forEach(emoji => {
                const dataUri = emojiMap.get(emoji.trim()) ?? emojiMap.get(detectEmojis(emoji)[0])
                if (dataUri) {
                    elements += `<image href="${dataUri}" x="${emojiX}" y="${emojiY}" width="${emojiSize}" height="${emojiSize}"/>\n`
                    emojiX += emojiSize * 1.05
                }
            })
            return elements
        }

        // 🌟 JALUR 2: STIKER BRAT (HARDCORE MANUAL JUSTIFY)
        // Di sini kita hitung paksa posisi X masing-masing kata agar melar rata kanan-kiri murni!
        const justifyWidth = 462 // Lebar kanvas aktif (Margin Kiri 25px, Kanan 25px)
        const emojiSize = fontSize * 1.05

        if (tokens.length === 1) {
            // Kalau cuma 1 kata, normal rata kiri
            const token = tokens[0]
            const isEmoji = detectEmojis(token).length > 0
            if (isEmoji) {
                const dataUri = emojiMap.get(token.trim()) ?? emojiMap.get(detectEmojis(token)[0])
                if (dataUri) elements += `<image href="${dataUri}" x="${x}" y="${y - emojiSize * 0.84}" width="${emojiSize}" height="${emojiSize}"/>\n`
            } else {
                elements += `<text x="${x}" y="${y}" text-anchor="start" font-family="${fontFamily}" font-weight="${fontWeight}" font-size="${fontSize}px" fill="${fill}" letter-spacing="${letterSpacing}">${this.#escapeXml(token)}</text>\n`
            }
        } else {
            // Kalau > 1 kata: Bikin Jurang Spasi!
            // 1. Estimasi lebar masing-masing token
            const tokenWidths = tokens.map(t => {
                if (detectEmojis(t).length > 0) return emojiSize
                // Ratio Arial Narrow = 0.44
                return [...t].length * fontSize * 0.44
            })

            // 2. Kalkulasi Sisa Spasi Kosong
            const totalContentWidth = tokenWidths.reduce((a, b) => a + b, 0)
            let gap = (justifyWidth - totalContentWidth) / (tokens.length - 1)

            // Pengaman kalau estimasi meluber kepanjangan
            if (gap < 0) gap = fontSize * 0.15

            // 3. Render satu per satu dengan plot koordinat mutlak!
            let currentX = x
            tokens.forEach((token, index) => {
                const isEmoji = detectEmojis(token).length > 0
                if (isEmoji) {
                    const dataUri = emojiMap.get(token.trim()) ?? emojiMap.get(detectEmojis(token)[0])
                    if (dataUri) elements += `<image href="${dataUri}" x="${currentX}" y="${y - emojiSize * 0.84}" width="${emojiSize}" height="${emojiSize}"/>\n`
                } else {
                    elements += `<text x="${currentX}" y="${y}" text-anchor="start" font-family="${fontFamily}" font-weight="${fontWeight}" font-size="${fontSize}px" fill="${fill}" letter-spacing="${letterSpacing}">${this.#escapeXml(token)}</text>\n`
                }
                // Lompat ke titik berikutnya sejauh lebar kata + spasi raksasa
                currentX += tokenWidths[index] + gap
            })
        }

        return elements
    }

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────

    async toQuoteSticker(rawText) {
        try {
            const cleanText = rawText.trim().toLowerCase()

            // 🌟 FIX 1: Dongkrak limit baris jadi 15 karakter biar "ternyata besok" muat 1 baris
            const lines = this.#wrapText(cleanText, 15)

            // 🌟 FIX 2: Hitung font size adaptif biar teks panjang gak nabrak dinding/terpotong
            const maxVisualLen = Math.max(...lines.map(l => {
                return [...l].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2000 ? 2 : 1), 0)
            }))

            // 462px = Lebar margin aman. 0.43 = Ratio kurus Arial Narrow
            let fontSize = Math.floor(462 / (maxVisualLen * 0.43))
            fontSize = Math.max(46, Math.min(115, fontSize))

            const lineSpacing = fontSize * 1.05

            // 🌟 FIX 3: Auto-Center Vertikal! Biar teksnya selalu cantik presisi di tengah kanvas
            const totalTextHeight = lines.length * lineSpacing
            const startY = (512 - totalTextHeight) / 2 + (fontSize * 0.75)

            const emojiMap = await prepareEmojiMap(cleanText)

            let svgContent = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)

                svgContent += this.#renderLine(line, y, fontSize, {
                    x: 25,
                    textAnchor: 'start',
                    fontFamily: "'Arial Narrow', Arial, sans-serif",
                    fontWeight: 'normal',
                    fill: '#000000',
                    emojiMap,
                    letterSpacing: '-2.5px'
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

            topData.lines.forEach((line, i) => {
                const y = topData.startY + (i * topData.lineSpacing)
                svgContent += this.#renderLine(line, y, topData.fontSize, {
                    x: 256,
                    textAnchor: 'middle',
                    fontFamily: "Impact, 'Arial Narrow', sans-serif",
                    fontWeight: 'bold',
                    fill: 'white',
                    stroke: 'black',
                    strokeWidth: topData.fontSize > 60 ? '8' : '5',
                    emojiMap,
                    letterSpacing: '0px'
                })
            })

            bottomData.lines.forEach((line, i) => {
                const y = bottomData.startY + (i * bottomData.lineSpacing)
                svgContent += this.#renderLine(line, y, bottomData.fontSize, {
                    x: 256,
                    textAnchor: 'middle',
                    fontFamily: "Impact, 'Arial Narrow', sans-serif",
                    fontWeight: 'bold',
                    fill: 'white',
                    stroke: 'black',
                    strokeWidth: bottomData.fontSize > 60 ? '8' : '5',
                    emojiMap,
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