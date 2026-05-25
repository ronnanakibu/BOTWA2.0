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
    // 🌟 FITUR BARU: AUTO WRAPPING UNTUK QUOTE CARD
    // ==========================================
    #wrapText(text, maxCharsPerLine = 16) {
        const words = text.trim().split(/\s+/)
        let lines = []
        let currentLine = ''

        words.forEach(word => {
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
     * Generator Quote Card Aesthetic (Hitam di atas Putih)
     */
    async toQuoteSticker(rawText) {
        try {
            // 1. Bungkus teks otomatis menjadi beberapa baris agar estetik ke bawah
            const lines = this.#wrapText(rawText, 16)

            // 2. Hitung font size dinamis berdasarkan jumlah baris agar tidak luber
            let fontSize = 52
            if (lines.length > 4) fontSize = 42
            if (lines.length > 8) fontSize = 32

            const lineSpacing = fontSize * 1.2
            const totalTextHeight = lines.length * lineSpacing

            // 3. Kalkulasi koordinat Y agar teks OTOMATIS berada di TENGAH VERTIKAL kanvas 512x512
            let startY = (512 - totalTextHeight) / 2 + fontSize - 10

            // 4. Bangun komponen text SVG (Rata kiri/Left-aligned dengan padding 45px sesuai gambar)
            let svgTextElements = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)
                const safeLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')

                svgTextElements += `
                <text x="45" y="${y}" 
                    font-family="Arial, sans-serif" 
                    font-weight="bold" 
                    font-size="${fontSize}px" 
                    fill="black">
                    ${safeLine}
                </text>\n`
            })

            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                ${svgTextElements}
            </svg>`)

            // 5. Racik menggunakan sharp dengan basic kanvas PUTIH SOLID (r:255, g:255, b:255)
            return await sharp({
                create: {
                    width: 512,
                    height: 512,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 } // Putih bersih, alpha 1 (solid)
                }
            })
                .composite([{ input: svgOverlay, top: 0, left: 0 }])
                .webp({ quality: 90 })
                .toBuffer()

        } catch (err) {
            logger.error('❌ Error inside MediaService.toQuoteSticker:', err.message)
            throw new Error('Gagal meracik quote card sticker.')
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