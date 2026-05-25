// src/services/media.js
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'

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

            const minimalConfig = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
    <dir>${fontDir}</dir>
    <cachedir>${cacheDir}</cachedir>
</fontconfig>`

            fs.writeFileSync(configFile, minimalConfig, 'utf8')
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig ready at: ${configFile}`)
        } catch (err) {
            console.error('❌ [MediaService] Gagal inisialisasi Fontconfig:', err.message)
        }
    }

    // ==========================================
    // 🌟 REFACTOR TOTAL: LOGIKA QUOTE CARD VIRAL
    // ==========================================
    #wrapText(text, maxCharsPerLine = 14) {
        const words = text.trim().split(/\s+/)
        let lines = []
        let currentLine = ''

        words.forEach(word => {
            // Jika kata itu sendiri super panjang, paksa pecah
            if (word.length > maxCharsPerLine) {
                if (currentLine) lines.push(currentLine.trim())
                lines.push(word)
                currentLine = ''
                return
            }

            if ((currentLine + word).length > maxCharsPerLine) {
                lines.push(currentLine.trim())
                currentLine = word + ' '
            } else {
                currentLine += word + ' '
            }
        })
        if (currentLine) lines.push(currentLine.trim())
        return lines
    }

    /**
     * Generator Stiker Meme Viral Sesuai Gambar (Rata Kiri, Logo Ps, Watermark)
     */
    async toQuoteSticker(rawText) {
        try {
            // 1. Biarkan teks original (dukung lowercase huruf kecil sesuai tren viral)
            const cleanText = rawText.trim()

            // 2. Potong kalimat menjadi baris-baris pendek rata kiri (max 14 karakter per baris)
            const lines = this.#wrapText(cleanText, 14)

            // 3. Set ukuran font konstan 65px agar tebal dan estetik (menyusut jika baris terlalu banyak)
            let fontSize = 65
            if (lines.length > 4) fontSize = 52
            if (lines.length > 7) fontSize = 42

            const lineSpacing = fontSize * 1.15

            // 4. Titik koordinat Y dimulai agak ke atas karena rata kiri mengalir ke bawah
            let startY = 135

            // 5. Bangun elemen teks biner SVG dengan font-family sans-serif
            let svgTextElements = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)
                const safeLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')

                svgTextElements += `
                <text x="35" y="${y}" 
                    font-family="Arial, Helvetica, sans-serif" 
                    font-weight="bold" 
                    font-size="${fontSize}px" 
                    fill="#1c1c1c"
                    letter-spacing="-1px">
                    ${safeLine}
                </text>\n`
            })

            // 🌟 STRING ASSET: Base64 Logo Photoshop (Ps) Biru Kotak Sempurna
            const logoPsBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAMAAABg3yd1AAAAMFBMVEVFX0EtX0MvYEUvYUUwYkYwY0YxY0cxY0gyZUkzZkozaEs0aUw1akw1a002bE43bU44blA6XkYxAAAAAXRSTlMAQObYZgAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAIdJREFUeNrtlksOwyAMRAnmByG09z9tV6mqqtK6idSFiGfGgG1m7CHZ6Z9mZNoS6Z6GfVwX0An8C9gbeAtYAmvAFvAOvAX6gCvgfVwXCD6+fCInA9YAdYByYAlQBygHlgB1gHJgCVAHKAeWAHWAcshzgv/C7uP7YwLeX0p6+v8v7Fv4V8De6Z/mO3XvA0u7vS7fAAAAAElFTkSuQmCC"

            // 6. Satukan seluruh komponen ke dalam Kanvas SVG
            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                <image href="${logoPsBase64}" x="35" y="35" width="45" height="45"/>
                
                ${svgTextElements}
                
                <text x="35" y="475" 
                    font-family="Arial, sans-serif" 
                    font-size="16px" 
                    fill="#8e8e8e" 
                    font-weight="bold">
                    @quoteariss
                </text>
            </svg>`)

            // 7. Render kanvas dasar putih bersih solid menggunakan sharp
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
            logger.error('❌ Error inside MediaService.toQuoteSticker:', err.message)
            throw new Error('Gagal meracik quote card sticker viral.')
        }
    }

    // ==========================================
    // LOGIKA MEME STICKER PHASE 1 (JANGAN DIHAPUS)
    // ==========================================
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
        fontSize = Math.max(30, Math.min(85, fontSize))
        const lineSpacing = fontSize * 1.1
        const startY = isBottom ? 475 - ((lines.length - 1) * lineSpacing) : fontSize + 20
        return { lines, fontSize, startY, lineSpacing }
    }

    #renderSvgText(lines, startY, fontSize, lineSpacing) {
        const strokeWidth = fontSize > 60 ? '8' : '5'
        let svgElements = ''
        lines.forEach((line, i) => {
            const y = startY + (i * lineSpacing)
            const safeLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            svgElements += `
            <text x="50%" y="${y}" text-anchor="middle" font-family="Impact" font-weight="bold" font-size="${fontSize}px" fill="white" stroke="black" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">${safeLine}</text>\n`
        })
        return svgElements
    }

    async toMemeSticker(bufferImage, topText = '', bottomText = '') {
        try {
            const cleanTop = topText.trim().toUpperCase()
            const cleanBottom = bottomText.trim().toUpperCase()
            const topData = this.#processTextAdaptive(cleanTop, false)
            const bottomData = this.#processTextAdaptive(cleanBottom, true)
            const svgTopElements = this.#renderSvgText(topData.lines, topData.startY, topData.fontSize, topData.lineSpacing)
            const svgBottomElements = this.#renderSvgText(bottomData.lines, bottomData.startY, bottomData.fontSize, bottomData.lineSpacing)
            const svgOverlay = Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">${svgTopElements}${svgBottomElements}</svg>`)
            return await sharp(bufferImage).resize(512, 512, { fit: 'cover', position: 'center' }).composite([{ input: svgOverlay, top: 0, left: 0 }]).webp({ quality: 85 }).toBuffer()
        } catch (err) {
            logger.error('❌ Error inside MediaService.toMemeSticker:', err.message)
            throw new Error('Gagal memproses pembuatan stiker teks meme.')
        }
    }
}

export default new MediaService()