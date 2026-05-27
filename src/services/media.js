// src/services/media.js
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'

class MediaService {
    constructor() {
        this.#initFontconfig()
    }

    /**
     * Mendaftarkan folder assets font fisik ke runtime server Pterodactyl.
     * Sekaligus mendaftarkan Noto Color Emoji sebagai fallback emoji berwarna.
     */
    #initFontconfig() {
        try {
            const configDir = path.resolve('./storage/database')
            const fontDir = path.resolve('./src/assets/fonts')
            const cacheDir = path.resolve('./storage/database/fontcache')
            const configFile = path.join(configDir, 'fonts.conf')

            if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
            if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true })
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

            // Sertakan sistem font Linux + folder custom + Noto Emoji fallback
            const minimalConfig = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
    <dir>${fontDir}</dir>

    <dir>/usr/share/fonts</dir>
    <dir>/usr/local/share/fonts</dir>

    <cachedir>${cacheDir}</cachedir>

    <alias>
        <family>Arial Narrow</family>
        <prefer><family>Arial Narrow</family></prefer>
        <default><family>Noto Color Emoji</family></default>
    </alias>
    <alias>
        <family>Impact</family>
        <prefer><family>Impact</family></prefer>
        <default><family>Noto Color Emoji</family></default>
    </alias>

    <match target="pattern">
        <test name="family"><string>Noto Color Emoji</string></test>
        <edit name="rgba" mode="assign"><const>rgb</const></edit>
    </match>
</fontconfig>`

            fs.writeFileSync(configFile, minimalConfig, 'utf8')
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig ready → ${fontDir}`)
            console.log(`⚙️ [MediaService] Emoji fallback: Noto Color Emoji`)
        } catch (err) {
            console.error('❌ [MediaService] Gagal inisialisasi Fontconfig:', err.message)
        }
    }

    // ─────────────────────────────────────────────
    // TEXT HELPERS
    // ─────────────────────────────────────────────

    /**
     * Word-wrap sempit khas Brat generator (max N karakter per baris).
     * Emoji dihitung sebagai 2 karakter (lebar visual).
     */
    #wrapText(text, maxCharsPerLine = 11) {
        const words = [...text.trim().matchAll(/\p{Emoji_Presentation}\p{Emoji_Modifier}*|\p{Emoji}\uFE0F|\S+/gu)]
            .map(m => m[0])

        let lines = []
        let currentLine = ''

        const visualLen = str => [...str].reduce((n, ch) => {
            const cp = ch.codePointAt(0)
            return n + (cp > 0x2000 ? 2 : 1)
        }, 0)

        words.forEach(word => {
            const wLen = visualLen(word)
            const lineLen = visualLen(currentLine)

            if (wLen > maxCharsPerLine) {
                if (currentLine) lines.push(currentLine.trim())
                lines.push(word)
                currentLine = ''
                return
            }
            if (lineLen + wLen > maxCharsPerLine) {
                lines.push(currentLine.trim())
                currentLine = word + ' '
            } else {
                currentLine += word + ' '
            }
        })
        if (currentLine.trim()) lines.push(currentLine.trim())
        return lines
    }

    /**
     * Escape karakter XML-unsafe di teks SVG.
     */
    #escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
    }

    /**
     * Kalkulasi font size adaptif + posisi startY untuk meme (top/bottom).
     */
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

        // Bottom: anchor dari 485px ke atas agar pas di lantai dasar kanvas Sharp
        const startY = isBottom
            ? 485 - ((lines.length - 1) * lineSpacing)
            : fontSize + 20

        return { lines, fontSize, startY, lineSpacing }
    }

    // ─────────────────────────────────────────────
    // SVG RENDER HELPERS
    // ─────────────────────────────────────────────

    /**
     * 🌟 FIX SAKRAL: Mengembalikan Teks Meme ke Rata Tengah (Center Aligned)
     * Atribut textLength justify dicopot total agar font Impact kembali padat natural.
     */
    #renderMemeText(lines, startY, fontSize, lineSpacing) {
        const strokeWidth = fontSize > 60 ? '8' : '5'
        let svgElements = ''

        lines.forEach((line, i) => {
            const y = startY + (i * lineSpacing)
            const safe = this.#escapeXml(line)

            svgElements += `
            <text
                x="50%"
                y="${y}"
                text-anchor="middle"
                font-family="Impact, 'Arial Narrow', 'Noto Color Emoji', sans-serif"
                font-weight="bold"
                font-size="${fontSize}px"
                fill="white"
                stroke="black"
                stroke-width="${strokeWidth}"
                stroke-linejoin="round"
                paint-order="stroke fill">${safe}</text>\n`
        })
        return svgElements
    }

    /**
     * Render SVG teks Brat style (hitam, lowercase, justify penuh).
     * Baris terakhir dibiarkan rata kiri sesuai kaidah justify paragraf.
     */
    #renderBratText(lines, startY, fontSize, lineSpacing) {
        const justifyWidth = 490
        let svgElements = ''

        lines.forEach((line, i) => {
            const y = startY + (i * lineSpacing)
            const safe = this.#escapeXml(line)
            const isLast = i === lines.length - 1

            const justifyAttr = (!isLast && lines.length > 1)
                ? `textLength="${justifyWidth}" lengthAdjust="spacing"`
                : ''

            svgElements += `
            <text
                x="25"
                y="${y}"
                font-family="'Arial Narrow', Arial, 'Noto Color Emoji', sans-serif"
                font-weight="normal"
                font-size="${fontSize}px"
                fill="#000000"
                letter-spacing="-2px"
                ${justifyAttr}>${safe}</text>\n`
        })
        return svgElements
    }

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────

    /**
     * Buat stiker teks Brat/anomali dari plain text.
     * Background putih, font hitam lowercase, justify penuh.
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

            const svgText = this.#renderBratText(lines, startY, fontSize, lineSpacing)

            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                ${svgText}
            </svg>`)

            return await sharp({
                create: {
                    width: 512,
                    height: 512,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            })
                .composite([{ input: svgOverlay, top: 0, left: 0 }])
                .webp({ quality: 95 })
                .toBuffer()

        } catch (err) {
            logger.error('❌ toQuoteSticker error:', err.message)
            throw new Error('Gagal meracik stiker brat.')
        }
    }

    /**
     * Buat stiker meme dari gambar + teks atas/bawah Impact style (Rata Tengah).
     */
    async toMemeSticker(bufferImage, topText = '', bottomText = '') {
        try {
            const cleanTop = topText.trim().toUpperCase()
            const cleanBottom = bottomText.trim().toUpperCase()

            const topData = this.#processTextAdaptive(cleanTop, false)
            const bottomData = this.#processTextAdaptive(cleanBottom, true)

            const svgTop = this.#renderMemeText(topData.lines, topData.startY, topData.fontSize, topData.lineSpacing)
            const svgBottom = this.#renderMemeText(bottomData.lines, bottomData.startY, bottomData.fontSize, bottomData.lineSpacing)

            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                ${svgTop}
                ${svgBottom}
            </svg>`)

            return await sharp(bufferImage)
                .resize(512, 512, { fit: 'cover', position: 'center' })
                .composite([{ input: svgOverlay, top: 0, left: 0 }])
                .webp({ quality: 85 })
                .toBuffer()

        } catch (err) {
            logger.error('❌ toMemeSticker error:', err.message)
            throw new Error('Gagal memproses stiker meme.')
        }
    }
}

export default new MediaService()