// src/utils/logger.js
import pino from 'pino'
import pinoPretty from 'pino-pretty'
import fs from 'fs'

// 🚀 PROTEKSI UTAMA: Pastikan folder storage dan sub-foldernya otomatis terbuat jika belum ada
const requiredDirs = [
    './storage/logs',
    './storage/sessions',
    './storage/database',
    './storage/media'
]

for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
}, isProduction
    ? pino.destination('./storage/logs/app.log')  // file di prod
    : pinoPretty({ colorize: true, translateTime: 'SYS:HH:MM:ss' })
)

// Child loggers per module
export const connLogger = logger.child({ module: 'connection' })
export const cmdLogger = logger.child({ module: 'commands' })