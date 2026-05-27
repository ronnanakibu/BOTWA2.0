/**
 * start.js — Bootstrap script untuk Pterodactyl
 * Jalankan ini sebagai entry point: node start.js
 *
 * Urutan eksekusi:
 * 1. Buat folder struktur yang diperlukan
 * 2. Download font jika belum ada (Impact, Noto Emoji, & Arial Narrow)
 * 3. Validasi environment variables
 * 4. Jalankan bot utama
 */

import { execSync, exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import https from 'https'

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const log = (emoji, msg) => console.log(`${emoji} [Bootstrap] ${msg}`)
const ok = (msg) => log('✅', msg)
const inf = (msg) => log('⚙️ ', msg)
const wrn = (msg) => log('⚠️ ', msg)
const err = (msg) => log('❌', msg)

/**
 * Jalankan shell command secara synchronous.
 * Kalau gagal, tidak crash — hanya log warning.
 */
function runCmd(cmd, label) {
    try {
        inf(`Running: ${label ?? cmd}`)
        execSync(cmd, { stdio: 'pipe' })
        ok(`Done: ${label ?? cmd}`)
        return true
    } catch (e) {
        wrn(`Gagal (non-fatal): ${label ?? cmd} — ${e.message.split('\n')[0]}`)
        return false
    }
}

/**
 * Download file dari URL ke path lokal.
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath)
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                // Handle redirect
                file.close()
                fs.unlinkSync(destPath)
                return downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
            }
            res.pipe(file)
            file.on('finish', () => { file.close(); resolve() })
        }).on('error', (e) => {
            fs.unlink(destPath, () => { })
            reject(e)
        })
    })
}

/**
 * Cek apakah binary/command tersedia di PATH.
 */
function commandExists(cmd) {
    try {
        execSync(`which ${cmd}`, { stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

// ─────────────────────────────────────────────
// STEP 1: BUAT FOLDER STRUKTUR
// ─────────────────────────────────────────────

function setupDirectories() {
    inf('Setting up folder structure...')

    const dirs = [
        './storage/sessions',
        './storage/database',
        './storage/database/fontcache',
        './storage/logs',
        './storage/media',
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
// STEP 2: INSTALL / SETUP EMOJI & TEMPLATE FONTS
// ─────────────────────────────────────────────

const FONT_DIR = path.resolve('./src/assets/fonts')

// Font yang dibutuhkan beserta URL download-nya
// Semua dari GitHub releases / Google Fonts CDN (HTTPS, reliable)
const REQUIRED_FONTS = [
    {
        name: 'NotoColorEmoji.ttf',
        // Google Noto Fonts — Noto Color Emoji latest
        url: 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf',
        description: 'Noto Color Emoji (Google)'
    },
    {
        name: 'Impact.ttf',
        // Impact dari CDN publik (dipakai untuk meme sticker)
        url: 'https://github.com/matomo-org/travis-scripts/raw/master/fonts/Impact.ttf',
        description: 'Impact (meme font)'
    },
    {
        name: 'arialn.ttf',
        url: 'https://raw.githubusercontent.com/uclalibrary/clis-images-docker/master/fonts/arialn.ttf',
        description: 'Arial Narrow Regular (stiker anomali font)'
    }
]

async function setupFonts() {
    inf('Checking fonts...')

    for (const font of REQUIRED_FONTS) {
        const destPath = path.join(FONT_DIR, font.name)

        if (fs.existsSync(destPath)) {
            const size = fs.statSync(destPath).size
            if (size > 10_000) { // > 10KB = valid font file
                ok(`Font already exists: ${font.name} (${(size / 1024 / 1024).toFixed(2)} MB)`)
                continue
            } else {
                wrn(`Font corrupt/empty, re-downloading: ${font.name}`)
                fs.unlinkSync(destPath)
            }
        }

        inf(`Downloading ${font.description}...`)
        try {
            await downloadFile(font.url, destPath)
            const size = fs.statSync(destPath).size
            ok(`Downloaded: ${font.name} (${(size / 1024 / 1024).toFixed(2)} MB)`)
        } catch (e) {
            wrn(`Gagal download ${font.name}: ${e.message}`)
            wrn(`Font tersebut mungkin tidak render sempurna — bot tetap dipaksa jalan.`)
        }
    }

    ok('Font setup complete.')
}

// ─────────────────────────────────────────────
// STEP 3: CEK FFMPEG (DICOMMENT SEMENTARA)
// ─────────────────────────────────────────────
/*
async function setupFfmpeg() {
    if (commandExists('ffmpeg')) {
        const version = execSync('ffmpeg -version', { stdio: 'pipe' })
            .toString().split('\n')[0]
        ok(`FFmpeg found: ${version}`)
        return
    }

    wrn('FFmpeg tidak ditemukan di PATH.')
    wrn('Fitur radio dan stiker animasi mungkin tidak berfungsi.')
    wrn('Hubungi provider Pterodactyl untuk install ffmpeg, atau gunakan egg yang sudah include ffmpeg.')
}
*/

// ─────────────────────────────────────────────
// STEP 4: CEK YT-DLP (DICOMMENT SEMENTARA)
// ─────────────────────────────────────────────
/*
async function setupYtDlp() {
    if (commandExists('yt-dlp')) {
        ok('yt-dlp found in PATH.')
        return
    }

    // Cek apakah sudah ada di node_modules (via yt-dlp-exec)
    const localPath = './node_modules/yt-dlp-exec/bin/yt-dlp'
    if (fs.existsSync(localPath)) {
        ok('yt-dlp found via yt-dlp-exec package.')
        return
    }

    wrn('yt-dlp tidak ditemukan. Fitur radio dan downloader mungkin tidak berfungsi.')
}
*/

// ─────────────────────────────────────────────
// STEP 5: VALIDASI .env
// ─────────────────────────────────────────────

function validateEnv() {
    inf('Validating environment variables...')

    // Load .env jika ada
    const envPath = './.env'
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8')
        envContent.split('\n').forEach(line => {
            const [key, ...val] = line.split('=')
            if (key && val.length && !process.env[key.trim()]) {
                process.env[key.trim()] = val.join('=').trim()
            }
        })
        ok('.env loaded.')
    } else {
        wrn('.env tidak ditemukan — pastikan env variables sudah di-set di panel Pterodactyl.')
    }

    // Wajib ada
    const required = ['OWNER_NUMBER', 'BOT_PREFIX']
    const missing = required.filter(k => !process.env[k])

    if (missing.length > 0) {
        err(`Missing required env vars: ${missing.join(', ')}`)
        err('Bot tidak bisa jalan tanpa variabel ini.')
        process.exit(1)
    }

    // Optional tapi penting — kasih warning
    const optional = ['GEMINI_API_KEY', 'GROQ_API_KEY']
    optional.forEach(k => {
        if (!process.env[k]) wrn(`${k} tidak di-set — fitur AI tidak aktif.`)
    })

    ok('Environment valid.')
}

// ─────────────────────────────────────────────
// STEP 6: PRINT SUMMARY
// ─────────────────────────────────────────────

function printSummary() {
    const fonts = fs.readdirSync(FONT_DIR).filter(f => f.endsWith('.ttf') || f.endsWith('.otf'))
    const hasFfmpeg = commandExists('ffmpeg')

    console.log('\n' + '─'.repeat(50))
    console.log('  🤖 RonnBot v2.0 — Bootstrap Summary')
    console.log('─'.repeat(50))
    console.log(`  Fonts loaded  : ${fonts.length > 0 ? fonts.join(', ') : 'none'}`)
    console.log(`  FFmpeg        : ${hasFfmpeg ? '✅ available' : '❌ not found (Disabled)'}`)
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

    // Spawn sebagai child process yang inherit stdio
    // Sehingga semua output bot langsung visible di Pterodactyl console
    const bot = spawn('node', ['src/core/bot.js'], {
        stdio: 'inherit',
        env: process.env
    })

    bot.on('exit', (code, signal) => {
        if (code === 0) {
            log('👋', 'Bot exited cleanly.')
        } else {
            err(`Bot exited with code ${code} (signal: ${signal})`)
            err('Pterodactyl akan restart container sesuai restart policy.')
        }
        process.exit(code ?? 1)
    })

    // Forward signal ke child process
    process.on('SIGTERM', () => bot.kill('SIGTERM'))
    process.on('SIGINT', () => bot.kill('SIGINT'))
}

// ─────────────────────────────────────────────
// MAIN — Sequential bootstrap
// ─────────────────────────────────────────────

async function main() {
    console.log('\n🚀 [Bootstrap] RonnBot v2.0 starting up...\n')

    try {
        setupDirectories()        // Step 1
        await setupFonts()        // Step 2 — async (download)
        // await setupFfmpeg()    // ⏳ Commented out: Menunggu modul Radio & Animasi siap
        // await setupYtDlp()     // ⏳ Commented out: Menunggu modul Downloader siap
        validateEnv()             // Step 5
        printSummary()            // Step 6
        launchBot()               // Step 7
    } catch (e) {
        err(`Bootstrap fatal error: ${e.message}`)
        console.error(e)
        process.exit(1)
    }
}

main()