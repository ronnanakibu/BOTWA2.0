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
         * Set ulang konfigurasi minimal tanpa mendaftarkan folder font eksternal
         * agar engine Sharp murni memakai font standar bawaan OS Linux.
         */
    #initFontconfig() {
        try {
            const configDir = path.resolve('./storage/database')
            const cacheDir = path.resolve('./storage/database/fontcache')
            const configFile = path.join(configDir, 'fonts.conf')

            if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

            // 🌟 KUNCI: Kosongkan tag <dir>, biarkan engine mendeteksi default Arial/Sans-Serif Linux
            const minimalConfig = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
    <cachedir>${cacheDir}</cachedir>
</fontconfig>`

            fs.writeFileSync(configFile, minimalConfig, 'utf8')

            // Update env runtime server
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig default system unlocked.`)
        } catch (err) {
            console.error('❌ [MediaService] Gagal update Fontconfig:', err.message)
        }
    }

    // ==========================================
    // 🔍 REFACTOR: LOGIKA PEMBUNGKUS TEXT ANOMALI
    // ==========================================
    #wrapText(text, maxCharsPerLine = 12) {
        const words = text.trim().split(/\s+/)
        let lines = []
        let currentLine = ''

        words.forEach(word => {
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
     * Generator Stiker Anomali/POV Facebook (Teks Tipis, Rata Kiri, Kanvas Putih)
     */
    async toQuoteSticker(rawText) {
        try {
            // Karakteristik 1: Sesuai contoh gambar, teks dipaksa huruf kecil murni
            const cleanText = rawText.trim().toLowerCase()

            // Karakteristik 2: Rata kiri pendek teratur (max 12-13 karakter per baris)
            const lines = this.#wrapText(cleanText, 12)

            // Ukuran font dibuat pas dan lega (default 72px, menyusut tipis jika chat terlalu panjang)
            let fontSize = 72
            if (lines.length > 4) fontSize = 60
            if (lines.length > 7) fontSize = 48

            // Jarak antar baris dibikin normal renggang khas ketikan standar browser
            const lineSpacing = fontSize * 1.35

            // Posisi awal Y ditaruh pas di pojok kiri atas (menyisakan ruang kosong besar di bawah)
            let startY = 85

            let svgTextElements = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)
                const safeLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')

                // 🌟 PERBAIKAN VITAL: font-weight="normal" (Menghapus total efek BOLD tebal digital)
                svgTextElements += `
                <text x="35" y="${y}" 
                    font-family="Arial, Helvetica, sans-serif" 
                    font-weight="normal" 
                    font-size="${fontSize}px" 
                    fill="#000000"
                    letter-spacing="-0.5px">
                    ${safeLine}
                </text>\n`
            })

            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                ${svgTextElements}
            </svg>`)

            // Render kanvas dengan background PUTIH BERSIH SOLID (r:255, g:255, b:255)
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
            logger.error('❌ Error inside MediaService.toAnomaliSticker:', err.message)
            throw new Error('Gagal meracik stiker teks anomali.')
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