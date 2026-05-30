/**
 * start.js — Bootstrap script untuk Pterodactyl
 * Urutan eksekusi:
 * 1. Buat folder struktur
 * 2. Download font
 * 3. Cek FFmpeg
 * 4. Download yt-dlp binary (untuk radio)
 * 5. Validasi .env
 * 6. Print summary
 * 7. Launch bot
 */

import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import https from 'https'

const log = (emoji, msg) => console.log(`${emoji} [Bootstrap] ${msg}`)
const ok = (msg) => log('✅', msg)
const inf = (msg) => log('⚙️ ', msg)
const wrn = (msg) => log('⚠️ ', msg)
const err = (msg) => log('❌', msg)

function commandExists(cmd) {
    try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return true }
    catch { return false }
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath)
        const request = (targetUrl) => {
            https.get(targetUrl, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.close()
                    return request(res.headers.location)
                }
                if (res.statusCode !== 200) {
                    file.close()
                    fs.unlink(destPath, () => { })
                    return reject(new Error(`HTTP ${res.statusCode}`))
                }
                res.pipe(file)
                file.on('finish', () => { file.close(); resolve() })
            }).on('error', (e) => { fs.unlink(destPath, () => { }); reject(e) })
        }
        request(url)
    })
}

// ─────────────────────────────────────────────
// STEP 1: FOLDER STRUCTURE
// ─────────────────────────────────────────────

function setupDirectories() {
    inf('Setting up folder structure...')
    const dirs = [
        './storage/sessions',
        './storage/database',
        './storage/database/fontcache',
        './storage/logs',
        './storage/media',
        './storage/media/emoji-cache',
        './storage/bin',            // ← yt-dlp binary
        './src/assets/fonts',
    ]
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
            inf(`Created: ${dir}`)
        }
    })
    ok('Folder structure ready.')
}

// ─────────────────────────────────────────────
// STEP 2: FONTS
// ─────────────────────────────────────────────

const FONT_DIR = path.resolve('./src/assets/fonts')

const REQUIRED_FONTS = [
    {
        name: 'NotoColorEmoji.ttf',
        url: 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf',
        description: 'Noto Color Emoji (Google)'
    },
    {
        name: 'Impact.ttf',
        url: 'https://github.com/matomo-org/travis-scripts/raw/master/fonts/Impact.ttf',
        description: 'Impact (meme font)'
    },
    {
        name: 'arialn.ttf',
        url: 'https://raw.githubusercontent.com/uclalibrary/clis-images-docker/master/fonts/arialn.ttf',
        description: 'Arial Narrow (brat font)'
    }
]

async function setupFonts() {
    inf('Checking fonts...')
    for (const font of REQUIRED_FONTS) {
        const destPath = path.join(FONT_DIR, font.name)
        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 10_000) {
            ok(`Font exists: ${font.name}`)
            continue
        }
        inf(`Downloading ${font.description}...`)
        try {
            await downloadFile(font.url, destPath)
            ok(`Downloaded: ${font.name} (${(fs.statSync(destPath).size / 1024 / 1024).toFixed(2)} MB)`)
        } catch (e) {
            wrn(`Gagal download ${font.name}: ${e.message}`)
        }
    }
    ok('Font setup complete.')
}

// ─────────────────────────────────────────────
// STEP 3: FFMPEG CHECK
// ─────────────────────────────────────────────

async function setupFfmpeg() {
    if (commandExists('ffmpeg')) {
        const version = execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0]
        ok(`FFmpeg: ${version}`)
        return
    }
    wrn('FFmpeg tidak ditemukan. Fitur radio dan stiker animasi tidak akan berfungsi.')
    wrn('Hubungi provider Pterodactyl untuk install ffmpeg.')
}

// ─────────────────────────────────────────────
// STEP 4: YT-DLP BINARY DOWNLOAD
// Standalone binary — tidak butuh Python sama sekali
// ─────────────────────────────────────────────

const YTDLP_PATH = path.resolve('./storage/bin/yt-dlp')
// GitHub releases selalu point ke versi terbaru
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

async function setupYtDlp() {
    // Cek apakah sudah ada dan ukurannya valid (binary ~30MB)
    if (fs.existsSync(YTDLP_PATH)) {
        const size = fs.statSync(YTDLP_PATH).size
        if (size > 1_000_000) {
            ok(`yt-dlp exists: ${(size / 1024 / 1024).toFixed(1)} MB`)
            try { fs.chmodSync(YTDLP_PATH, '755') } catch (_) { }
            process.env.YTDLP_PATH = YTDLP_PATH
            return
        }
        wrn('yt-dlp binary corrupt, re-downloading...')
        fs.unlinkSync(YTDLP_PATH)
    }

    inf('Downloading yt-dlp binary (~30MB, hanya sekali)...')
    try {
        await downloadFile(YTDLP_URL, YTDLP_PATH)
        fs.chmodSync(YTDLP_PATH, '755') // chmod +x
        const size = fs.statSync(YTDLP_PATH).size
        ok(`yt-dlp downloaded: ${(size / 1024 / 1024).toFixed(1)} MB`)
        process.env.YTDLP_PATH = YTDLP_PATH
    } catch (e) {
        wrn(`Gagal download yt-dlp: ${e.message}`)
        wrn('Fitur radio dan downloader tidak akan berfungsi.')
    }
}

// ─────────────────────────────────────────────
// STEP 5: VALIDASI .env
// ─────────────────────────────────────────────

function validateEnv() {
    inf('Validating environment variables...')
    const envPath = './.env'
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8')
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) return
            const [key, ...val] = trimmed.split('=')
            if (key && val.length && !process.env[key.trim()]) {
                process.env[key.trim()] = val.join('=').trim()
            }
        })
        ok('.env loaded.')
    } else {
        wrn('.env tidak ditemukan — pastikan env variables sudah di-set di panel Pterodactyl.')
    }

    const required = ['OWNER_NUMBER', 'BOT_PREFIX']
    const missing = required.filter(k => !process.env[k])
    if (missing.length > 0) {
        err(`Missing required env vars: ${missing.join(', ')}`)
        process.exit(1)
    }

    const optional = ['GEMINI_API_KEY', 'GROQ_API_KEY']
    optional.forEach(k => {
        if (!process.env[k]) wrn(`${k} tidak di-set — fitur AI tidak aktif.`)
    })

    ok('Environment valid.')
}

// ─────────────────────────────────────────────
// STEP 6: SUMMARY
// ─────────────────────────────────────────────

function printSummary() {
    const fonts = fs.readdirSync(FONT_DIR).filter(f => f.endsWith('.ttf') || f.endsWith('.otf'))
    const hasFfmpeg = commandExists('ffmpeg')
    const hasYtdlp = fs.existsSync(YTDLP_PATH)

    console.log('\n' + '─'.repeat(50))
    console.log('  🤖 RonnBot v2.0 — Bootstrap Summary')
    console.log('─'.repeat(50))
    console.log(`  Fonts         : ${fonts.length > 0 ? fonts.join(', ') : 'none'}`)
    console.log(`  FFmpeg        : ${hasFfmpeg ? '✅ available' : '❌ not found (radio disabled)'}`)
    console.log(`  yt-dlp        : ${hasYtdlp ? '✅ ready' : '❌ not found (radio disabled)'}`)
    console.log(`  Owner         : ${process.env.OWNER_NUMBER ?? 'not set'}`)
    console.log(`  Prefix        : ${process.env.BOT_PREFIX ?? '!'}`)
    console.log(`  Session path  : ${process.env.SESSION_PATH ?? './storage/sessions'}`)
    console.log(`  Node version  : ${process.version}`)
    console.log('─'.repeat(50) + '\n')
}

// ─────────────────────────────────────────────
// STEP 7: LAUNCH BOT
// ─────────────────────────────────────────────

function launchBot() {
    inf('Launching bot...\n')
    const bot = spawn('node', ['src/core/bot.js'], {
        stdio: 'inherit',
        env: process.env
    })
    bot.on('exit', (code, signal) => {
        code === 0
            ? log('👋', 'Bot exited cleanly.')
            : err(`Bot exited with code ${code} (signal: ${signal})`)
        process.exit(code ?? 1)
    })
    process.on('SIGTERM', () => bot.kill('SIGTERM'))
    process.on('SIGINT', () => bot.kill('SIGINT'))
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
    console.log('\n🚀 [Bootstrap] RonnBot v2.0 starting up...\n')
    try {
        setupDirectories()
        await setupFonts()
        await setupFfmpeg()
        await setupYtDlp()
        validateEnv()
        printSummary()
        launchBot()
    } catch (e) {
        err(`Bootstrap fatal error: ${e.message}`)
        console.error(e)
        process.exit(1)
    }
}

main()