// src/services/media.js
import sharp from 'sharp'
import { logger } from '../utils/logger.js'

class MediaService {
    /**
     * Mengubah buffer gambar mentah menjadi WebP dengan resolusi standar stiker WA (512x512)
     * @param {Buffer} bufferImage - Buffer gambar dari file terunduh
     * @returns {Promise<Buffer>} Buffer WebP stiker
     */
    async toSticker(bufferImage) {
        try {
            return await sharp(bufferImage)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // Auto transparan background
                })
                .webp({ quality: 80 }) // Optimasi size stiker biar ringan didownload di HP
                .toBuffer()
        } catch (err) {
            logger.error('❌ Error inside MediaService.toSticker:', err)
            throw new Error('Gagal memproses konversi gambar ke stiker.')
        }
    }
}

export default new MediaService()