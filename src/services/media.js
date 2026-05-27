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
     * Mendaftarkan folder assets font fisik ke runtime server Pterodactyl
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

            const minimalConfig = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
    <dir>${fontDir}</dir>
    <cachedir>${cacheDir}</cachedir>
</fontconfig>`

            fs.writeFileSync(configFile, minimalConfig, 'utf8')
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig ready. Locked folder: ${fontDir}`)
        } catch (err) {
            console.error('❌ [MediaService] Gagal inisialisasi Fontconfig:', err.message)
        }
    }

    // Pemotong baris sempit padat khas brat generator (max 11-12 karakter per baris)
    #wrapText(text, maxCharsPerLine = 11) {
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
         * Generator Stiker Brat/Anomali NATIVE JUSTIFY (Anti-Blank Putih)
         * Memaksa teks rata kanan-kiri menggunakan atribut textLength bawaan SVG murni.
         */
    async toQuoteSticker(rawText) {
        try {
            // Huruf kecil murni khas brat generator
            const cleanText = rawText.trim().toLowerCase()
            const lines = this.#wrapText(cleanText, 11)

            // Ukuran font adaptif raksasa penuh memenuhi kanvas
            let fontSize = 105
            if (lines.length > 3) fontSize = 82
            if (lines.length > 5) fontSize = 64
            if (lines.length > 8) fontSize = 46

            const lineSpacing = fontSize * 1.05
            let startY = 90

            let svgTextElements = ''
            lines.forEach((line, i) => {
                const y = startY + (i * lineSpacing)
                const safeLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')

                // 🌟 KUNCI JUSTIFY ANTI-CRASH: 
                // Jika bukan baris terakhir, paksa merenggang memenuhi lebar 455px menggunakan textLength.
                // Jika baris terakhir, biarkan rata kiri normal (sesuai kaidah paragraf justify asli).
                const isLastLine = i === lines.length - 1
                const justifyAttr = (!isLastLine && lines.length > 1)
                    ? `textLength="472" lengthAdjust="spacing"`
                    : ''

                svgTextElements += `
                <text x="25" y="${y}" 
                    font-family="'Arial Narrow', Arial, sans-serif" 
                    font-weight="normal" 
                    font-size="${fontSize}px" 
                    fill="#000000"
                    letter-spacing="-2px"
                    ${justifyAttr}>
                    ${safeLine}
                </text>\n`
            })

            // Menggunakan struktur SVG murni 100% tanpa foreignObject HTML
            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                ${svgTextElements}
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
            logger.error('❌ Error inside MediaService.toQuoteSticker (Native Justify):', err.message)
            throw new Error('Gagal meracik stiker brat native justify.')
        }
    }

    // ==========================================
    // LOGIKA MEME STICKER PHASE 1 (JANGAN DIHAPUS)
    // ==========================================
    /**
    /**
     * Kalibrasi Fix Teks Bawah Meme: Memberikan ruang padding aman (baseline offset) 
     * agar teks bawah tidak mentok dinding kanvas Sharp 512x512 dan tidak mental ke atas.
     */
    #processTextAdaptive(text, isBottom = false) {
        if (!text) {
            return { lines: [], fontSize: 80, startY: 0, lineSpacing: 0 }
        }

        const words = text.trim().split(/\s+/)
        let lines = []

        // Otomatis bagi jadi 2 baris jika teks terlalu panjang
        if (text.length > 15 && words.length > 1) {
            const mid = Math.ceil(words.length / 2)
            lines.push(words.slice(0, mid).join(' '))
            lines.push(words.slice(mid).join(' '))
        } else {
            lines.push(text)
        }

        const maxLineLength = Math.max(...lines.map(l => l.length))
        // Kalkulasi font size adaptif
        let fontSize = Math.floor(490 / (maxLineLength * 0.55))
        fontSize = Math.max(35, Math.min(85, fontSize))

        const lineSpacing = fontSize * 1.05

        // 🌟 JALUR KALIBRASI MUTLAK: Teks bawah dikunci dari koordinat aman 455px (bukan 485px/495px)
        // Ini memberikan space agar ekor font Impact tidak menabrak batas bawah kanvas Sharp
        const startY = isBottom
            ? 490 - ((lines.length - 1) * lineSpacing)
            : fontSize + 20

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
            // SESUDAH (fix)
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