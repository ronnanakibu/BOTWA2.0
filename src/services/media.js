// src/services/media.js
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'

class MediaService {
    #fontBase64 = ''

    constructor() {
        this.#initFontconfig() // 🌟 Langkah 1: Jinakkan Fontconfig error di Linux server
        this.#loadFontBiner()  // Langkah 2: Muat aset font impact mentah
    }

    /**
     * Mengatasi Fontconfig error (No such file: (null)) di server Pterodactyl
     * dengan cara menyuntikkan template XML fonts.conf minimal langsung ke RAM environment.
     */
    #initFontconfig() {
        try {
            const configDir = path.resolve('./storage/database')
            const configFile = path.join(configDir, 'fonts.conf')

            // Buat file fonts.conf tiruan jika belum ada di server
            if (!fs.existsSync(configFile)) {
                const minimalConfig = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
    <cachedir>/tmp/fontconfig-cache</cachedir>
</fontconfig>`
                fs.writeFileSync(configFile, minimalConfig, 'utf8')
            }

            // Paksa sistem operasi container membaca file konfigurasi tiruan kita
            process.env.FONTCONFIG_FILE = configFile
            console.log(`⚙️ [MediaService] Fontconfig environment secured at: ${configFile}`)
        } catch (err) {
            console.error('❌ [MediaService] Gagal melakukan bypass Fontconfig:', err.message)
        }
    }

    /**
     * Membaca file font lokal impact.ttf dan mengonversinya ke string Base64
     */
    #loadFontBiner() {
        try {
            const fontPath = path.resolve('./src/assets/fonts/impact.ttf')
            if (fs.existsSync(fontPath)) {
                this.#fontBase64 = fs.readFileSync(fontPath).toString('base64')
                console.log('✅ [MediaService] Font Impact sukses dikunci ke RAM (Base64 Portable Mode).')
            } else {
                console.log('⚠️ [MediaService] File impact.ttf tidak ditemukan di ./src/assets/fonts/. Memakai fallback font sistem.')
            }
        } catch (err) {
            console.error('❌ [MediaService] Gagal memuat font biner:', err.message)
        }
    }

    #processTextAdaptive(text, isBottom = false) {
        if (!text) {
            return { lines: [], fontSize: 80, startY: 0, lineSpacing: 0 }
        }

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
        const startY = isBottom
            ? 475 - ((lines.length - 1) * lineSpacing)
            : fontSize + 20

        return { lines, fontSize, startY, lineSpacing }
    }

    #renderSvgText(lines, startY, fontSize, lineSpacing) {
        const strokeWidth = fontSize > 60 ? '8' : '5'
        let svgElements = ''

        lines.forEach((line, i) => {
            const y = startY + (i * lineSpacing)
            const safeLine = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')

            svgElements += `
            <text x="50%" y="${y}" 
                text-anchor="middle" 
                font-family="ImpactMeme" 
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

    async toMemeSticker(bufferImage, topText = '', bottomText = '') {
        try {
            const cleanTop = topText.trim().toUpperCase()
            const cleanBottom = bottomText.trim().toUpperCase()

            const topData = this.#processTextAdaptive(cleanTop, false)
            const bottomData = this.#processTextAdaptive(cleanBottom, true)

            const svgTopElements = this.#renderSvgText(topData.lines, topData.startY, topData.fontSize, topData.lineSpacing)
            const svgBottomElements = this.#renderSvgText(bottomData.lines, bottomData.startY, bottomData.fontSize, bottomData.lineSpacing)

            let fontStyleRule = `
            @font-face {
                font-family: 'ImpactMeme';
                src: local('Impact'), local('Arial');
            }`

            if (this.#fontBase64) {
                fontStyleRule = `
                @font-face {
                    font-family: 'ImpactMeme';
                    src: url(data:application/x-font-ttf;charset=utf-8;base64,${this.#fontBase64});
                }`
            }

            const svgOverlay = Buffer.from(`
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <style>
                        ${fontStyleRule}
                    </style>
                </defs>
                ${svgTopElements}
                ${svgBottomElements}
            </svg>`)

            return await sharp(bufferImage)
                .resize(512, 512, {
                    fit: 'cover',
                    position: 'center'
                })
                .composite([{ input: svgOverlay, top: 0, left: 0 }])
                .webp({ quality: 85 })
                .toBuffer()

        } catch (err) {
            logger.error('❌ Error inside MediaService.toMemeSticker:', err.message)
            throw new Error('Gagal memproses pembuatan stiker teks meme.')
        }
    }
}

export default new MediaService()