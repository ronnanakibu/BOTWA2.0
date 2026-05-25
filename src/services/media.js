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
    // 🟢 REFACTOR TOTAL: BRAT ALBUM COVER GENERATOR
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
     * Generator Stiker Tren Viral: brat text generator (Charli XCX style)
     */
    async toQuoteSticker(rawText) {
        try {
            // Ciri khas Brat: Semuanya dipaksa huruf kecil murni (lowercase)
            const cleanText = rawText.trim().toLowerCase()

            // Brat memiliki baris yang sangat sempit dan padat (max 11-12 karakter per baris)
            const lines = this.#wrapText(cleanText, 11)

            // Ukuran font Brat default-nya besar, tebal, tapi menyusut jika teksnya panjang sekali
            let fontSize = 78
            if (lines.length > 3) fontSize = 64
            if (lines.length > 5) fontSize = 50
            if (lines.length > 8) fontSize = 38

            // Jarak antar baris dibuat super rapat (ciri khas cover brat)
            const lineSpacing = fontSize * 0.96

            // Posisi awal teks dimulai dari koordinat agak atas kiri
            let startY = 120

            let svgTextElements = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)
                const safeLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')

                // Menggunakan Arial Narrow / Arial Black dengan letter-spacing minus (-) agar rapat berdempetan
                svgTextElements += `
                <text x="55" y="${y}" 
                    font-family="'Arial Narrow', Arial, sans-serif" 
                    font-stretch="condensed"
                    font-weight="900" 
                    font-size="${fontSize}px" 
                    fill="#000000"
                    letter-spacing="-3px"
                    filter="url(#bratBlur)">
                    ${safeLine}
                </text>\n`
            })

            // Overlay SVG lengkap dengan filter efek 'sedikit blur/low-res' agar 100% mirip aslinya
            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="bratBlur">
                        <feGaussianBlur stdDeviation="0.4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                ${svgTextElements}
            </svg>`)

            // Render kanvas dasar menggunakan kode warna Hijau Neon Brat asli (#8ace00)
            return await sharp({
                create: {
                    width: 512,
                    height: 512,
                    channels: 4,
                    background: { r: 138, g: 206, b: 0, alpha: 1 } // #8ace00 (Brat Lime Green)
                }
            })
                .composite([{ input: svgOverlay, top: 0, left: 0 }])
                .webp({ quality: 90 }) // Sedikit compression biar dapet tekstur lofi-nya
                .toBuffer()

        } catch (err) {
            logger.error('❌ Error inside MediaService.toBratSticker:', err.message)
            throw new Error('Gagal meracik stiker brat generator.')
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