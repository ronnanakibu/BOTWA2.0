// src/services/media.js
import sharp from 'sharp'
import { logger } from '../utils/logger.js'

class MediaService {
    /**
     * Porting Logika Adaptif v1: Menghitung pembungkusan teks, ukuran font, 
     * dan titik koordinat Y secara otomatis berdasarkan panjang teks.
     */
    #processTextAdaptive(text, isBottom = false) {
        if (!text) {
            return { lines: [], fontSize: 80, startY: 0, lineSpacing: 0 }
        }

        const words = text.trim().split(/\s+/)
        let lines = []

        // Jika teks panjang, otomatis potong jadi 2 baris (logika v1)
        if (text.length > 15 && words.length > 1) {
            const mid = Math.ceil(words.length / 2)
            lines.push(words.slice(0, mid).join(' '))
            lines.push(words.slice(mid).join(' '))
        } else {
            lines.push(text)
        }

        const maxLineLength = Math.max(...lines.map(l => l.length))
        // Kalkulasi font size dinamis agar pas di dalam frame
        let fontSize = Math.floor(490 / (maxLineLength * 0.55))
        fontSize = Math.max(30, Math.min(85, fontSize)) // Batasi ukuran teronggok aman

        const lineSpacing = fontSize * 1.1
        const startY = isBottom
            ? 475 - ((lines.length - 1) * lineSpacing)
            : fontSize + 20

        return { lines, fontSize, startY, lineSpacing }
    }

    /**
     * Membuat elemen teks SVG murni dengan stroke outline hitam tebal khas meme internet.
     */
    #renderSvgText(lines, startY, fontSize, lineSpacing) {
        const strokeWidth = fontSize > 60 ? '8' : '5'
        let svgElements = ''

        lines.forEach((line, i) => {
            const y = startY + (i * lineSpacing)
            // Amankan entitas string dari crash parser XML SVG
            const safeLine = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')

            svgElements += `
            <text x="50%" y="${y}" 
                text-anchor="middle" 
                font-family="Impact, Arial, sans-serif" 
                font-weight="bold" 
                font-size="${fontSize}px" 
                fill="white" 
                stroke="black" 
                stroke-width="${strokeWidth}" 
                stroke-linejoin="round" 
                paint-order="stroke fill">
                ${safeLine}
            </text>\n`
        })

        return svgElements
    }

    /**
     * Core Pipeline: Meng-crop gambar ke 512x512 dan menindihnya dengan teks overlay meme
     */
    async toMemeSticker(bufferImage, topText = '', bottomText = '') {
        try {
            // 1. Standarisasi teks ke UPPERCASE huruf besar (Format mutlak meme v1)
            const cleanTop = topText.trim().toUpperCase()
            const cleanBottom = bottomText.trim().toUpperCase()

            // 2. Hitung penataan layout teks atas dan bawah secara adaptif
            const topData = this.#processTextAdaptive(cleanTop, false)
            const bottomData = this.#processTextAdaptive(cleanBottom, true)

            // 3. Bangun string komponen teks SVG
            const svgTopElements = this.#renderSvgText(topData.lines, topData.startY, topData.fontSize, topData.lineSpacing)
            const svgBottomElements = this.#renderSvgText(bottomData.lines, bottomData.startY, bottomData.fontSize, bottomData.lineSpacing)

            // 4. Wadahi ke dalam kanvas SVG transparan ukuran standar WhatsApp (512x512)
            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                ${svgTopElements}
                ${svgBottomElements}
            </svg>`)

            // 5. Olah biner gambar menggunakan Sharp (Auto cropping cover center + Composite teks)
            return await sharp(bufferImage)
                .resize(512, 512, {
                    fit: 'cover', // Otomatis potong bagian tengah gambar jadi square pas layaknya mentahan meme!
                    position: 'center'
                })
                .composite([{ input: svgOverlay, top: 0, left: 0 }]) // Tempel teks SVG di atasnya
                .webp({ quality: 85 })
                .toBuffer()

        } catch (err) {
            logger.error('❌ Error inside MediaService.toMemeSticker:', err.message)
            throw new Error('Gagal memproses pembuatan stiker teks meme.')
        }
    }
}

export default new MediaService()