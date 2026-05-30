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

function canRun(cmd, args = ['--version']) {
    try { execSync(`${cmd} ${args.join(' ')}`, { stdio: 'pipe', timeout: 5000 }); return true }
    catch { return false }
}

// Coba semua nama Python yang mungkin ada di server
const PYTHON_CANDIDATES = [
    'python3', 'python', 'python3.13', 'python3.12', 'python3.11',
    'python3.10', 'python3.9', 'python3.8',
    '/usr/bin/python3', '/usr/local/bin/python3',
    '/usr/bin/python', '/usr/local/bin/python',
]

function findPython(testArgs = ['--version']) {
    for (const p of PYTHON_CANDIDATES) {
        if (canRun(p, testArgs)) return p
    }
    return null
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const request = (targetUrl) => {
            https.get(targetUrl, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return request(res.headers.location)
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}`))
                }
                const file = fs.createWriteStream(destPath)
                res.pipe(file)
                file.on('finish', () => { file.close(); resolve() })
                file.on('error', (e) => { fs.unlink(destPath, () => { }); reject(e) })
            }).on('error', (e) => { reject(e) })
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
// STEP 3: FFMPEG — auto-download static binary
// Pakai ffmpeg-static build untuk Linux Debian x86_64
// Tidak butuh apt, tidak butuh root
// ─────────────────────────────────────────────

const FFMPEG_PATH = path.resolve('./storage/bin/ffmpeg')
// John Van Sickle ffmpeg static builds — paling reliable untuk Debian/Ubuntu
const FFMPEG_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
const FFMPEG_TAR = path.resolve('./storage/bin/ffmpeg.tar.xz')

async function setupFfmpeg() {
    // Cek apakah sudah ada di PATH sistem dulu
    if (commandExists('ffmpeg')) {
        const version = execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0]
        ok(`FFmpeg (system): ${version}`)
        return
    }

    // Cek apakah binary lokal sudah ada
    if (fs.existsSync(FFMPEG_PATH)) {
        const size = fs.statSync(FFMPEG_PATH).size
        if (size > 10_000_000) { // > 10MB = valid
            ok(`FFmpeg (local): ${(size / 1024 / 1024).toFixed(1)} MB`)
            try { fs.chmodSync(FFMPEG_PATH, '755') } catch (_) { }
            // Tambah ke PATH supaya spawn('ffmpeg') bisa ketemu
            process.env.PATH = path.resolve('./storage/bin') + ':' + process.env.PATH
            return
        }
        wrn('FFmpeg binary corrupt, re-downloading...')
        fs.unlinkSync(FFMPEG_PATH)
    }

    inf('Downloading FFmpeg static binary untuk Debian (~80MB, hanya sekali)...')
    inf('Ini mungkin butuh 1-2 menit tergantung koneksi server...')

    try {
        // Download tar.xz
        await downloadFile(FFMPEG_URL, FFMPEG_TAR)
        inf(`Downloaded tar: ${(fs.statSync(FFMPEG_TAR).size / 1024 / 1024).toFixed(1)} MB`)

        // Extract binary ffmpeg dari tar.xz
        // tar -xJ (xz) → extract file ffmpeg saja ke storage/bin/
        inf('Extracting ffmpeg binary...')
        execSync(
            `tar -xJf "${FFMPEG_TAR}" --wildcards "*/ffmpeg" --strip-components=1 -C "${path.resolve('./storage/bin/')}"`,
            { stdio: 'pipe' }
        )

        // Cleanup tar
        try { fs.unlinkSync(FFMPEG_TAR) } catch (_) { }

        if (!fs.existsSync(FFMPEG_PATH)) {
            throw new Error('ffmpeg binary tidak ditemukan setelah extract')
        }

        fs.chmodSync(FFMPEG_PATH, '755')
        const size = fs.statSync(FFMPEG_PATH).size
        ok(`FFmpeg downloaded & extracted: ${(size / 1024 / 1024).toFixed(1)} MB`)

        // Tambah ke PATH
        process.env.PATH = path.resolve('./storage/bin') + ':' + process.env.PATH

    } catch (e) {
        wrn(`Gagal setup FFmpeg: ${e.message}`)
        wrn('Fitur radio tidak akan berfungsi. Coba restart bot untuk download ulang.')
        // Cleanup kalau gagal
        try { fs.unlinkSync(FFMPEG_TAR) } catch (_) { }
        try { fs.unlinkSync(FFMPEG_PATH) } catch (_) { }
    }
}

// Dua URL: native ELF (cepat, tidak butuh python) dan zipapp (universal, butuh python3)
const YTDLP_PATH     = path.resolve('./storage/bin/yt-dlp')       // native ELF binary
const YTDLP_PYZ_PATH = path.resolve('./storage/bin/yt-dlp.pyz')   // python zipapp fallback
const YTDLP_URL_ELF  = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'
const YTDLP_URL_PYZ  = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

async function setupYtDlp() {
    // 1. Cek yt-dlp global yang benar-benar bisa dijalankan
    //    (bukan cuma 'which' — karena ./storage/bin juga di PATH dan bisa menipu)
    if (canRun('yt-dlp')) {
        const realPath = (() => { try { return execSync('which yt-dlp', { stdio: 'pipe' }).toString().trim() } catch { return 'yt-dlp' } })()
        // Pastikan bukan binary lokal kita yang broken
        if (!realPath.includes('storage/bin')) {
            ok(`yt-dlp (system): ${realPath}`)
            process.env.YTDLP_PATH = 'yt-dlp'
            return
        }
    }

    // 2. Cek binary ELF lokal: ada dan bisa dijalankan secara native?
    if (fs.existsSync(YTDLP_PATH) && fs.statSync(YTDLP_PATH).size > 10_000_000) {
        if (canRun(YTDLP_PATH)) {
            ok(`yt-dlp (native ELF): ${(fs.statSync(YTDLP_PATH).size / 1024 / 1024).toFixed(1)} MB`)
            try { fs.chmodSync(YTDLP_PATH, '755') } catch (_) { }
            process.env.YTDLP_PATH = YTDLP_PATH
            return
        }
        wrn(`yt-dlp ELF ada tapi tidak bisa dijalankan (kemungkinan Alpine/musl Linux). Beralih ke zipapp...`)
    }

    // 3. Cek zipapp lokal dengan semua interpreter Python yang mungkin
    if (fs.existsSync(YTDLP_PYZ_PATH) && fs.statSync(YTDLP_PYZ_PATH).size > 1_000_000) {
        const python = findPython([YTDLP_PYZ_PATH, '--version'])
        if (python) {
            ok(`yt-dlp (zipapp via ${python}): ${(fs.statSync(YTDLP_PYZ_PATH).size / 1024 / 1024).toFixed(1)} MB`)
            process.env.YTDLP_PATH = YTDLP_PYZ_PATH
            process.env.YTDLP_MODE = python
            return
        }
    }

    // 4. Download ELF binary terlebih dahulu (jika belum atau corrupt)
    if (!fs.existsSync(YTDLP_PATH) || fs.statSync(YTDLP_PATH).size < 10_000_000) {
        inf('Downloading yt-dlp Linux ELF binary (~30MB)...')
        try {
            if (fs.existsSync(YTDLP_PATH)) fs.unlinkSync(YTDLP_PATH)
            await downloadFile(YTDLP_URL_ELF, YTDLP_PATH)
            fs.chmodSync(YTDLP_PATH, '755')
            const sizeMB = (fs.statSync(YTDLP_PATH).size / 1024 / 1024).toFixed(1)
            ok(`yt-dlp ELF downloaded: ${sizeMB} MB`)
            if (canRun(YTDLP_PATH)) {
                ok('yt-dlp ELF: runnable ✓')
                process.env.YTDLP_PATH = YTDLP_PATH
                return
            }
            wrn('yt-dlp ELF tidak bisa dijalankan di OS ini (glibc missing). Downloading zipapp...')
        } catch (e) {
            wrn(`Gagal download yt-dlp ELF: ${e.message}`)
        }
    }

    // 5. Download Python zipapp, coba semua interpreter Python
    if (!fs.existsSync(YTDLP_PYZ_PATH) || fs.statSync(YTDLP_PYZ_PATH).size < 1_000_000) {
        inf('Downloading yt-dlp Python zipapp (~4MB, universal untuk semua Linux)...')
        try {
            if (fs.existsSync(YTDLP_PYZ_PATH)) fs.unlinkSync(YTDLP_PYZ_PATH)
            await downloadFile(YTDLP_URL_PYZ, YTDLP_PYZ_PATH)
            fs.chmodSync(YTDLP_PYZ_PATH, '755')
            ok(`yt-dlp zipapp downloaded: ${(fs.statSync(YTDLP_PYZ_PATH).size / 1024 / 1024).toFixed(1)} MB`)
        } catch (e) {
            wrn(`Gagal download yt-dlp zipapp: ${e.message}`)
        }
    }

    if (fs.existsSync(YTDLP_PYZ_PATH)) {
        const python = findPython([YTDLP_PYZ_PATH, '--version'])
        if (python) {
            ok(`yt-dlp zipapp via ${python}: runnable ✓`)
            process.env.YTDLP_PATH = YTDLP_PYZ_PATH
            process.env.YTDLP_MODE = python
            return
        }
    }

    // 6. Terakhir: coba install via pip
    inf('Mencoba install yt-dlp via pip (last resort)...')
    const pipCmds = ['pip3 install -q --user yt-dlp', 'pip install -q --user yt-dlp']
    for (const pipCmd of pipCmds) {
        try {
            inf(`Running: ${pipCmd}`)
            execSync(pipCmd, { stdio: 'pipe', timeout: 120_000 })
            if (canRun('yt-dlp')) {
                const realPath = (() => { try { return execSync('which yt-dlp', { stdio: 'pipe' }).toString().trim() } catch { return 'yt-dlp' } })()
                ok(`yt-dlp berhasil diinstall via pip: ${realPath}`)
                process.env.YTDLP_PATH = 'yt-dlp'
                return
            }
        } catch (_) { /* pip tidak tersedia atau gagal */ }
    }

    wrn('GAGAL: yt-dlp tidak bisa dijalankan di server ini.')
    wrn('Diagnosis:')
    wrn(`  - glibc binary: tidak support (Alpine/musl Linux)`)
    wrn(`  - Python tersedia: ${findPython() ?? 'TIDAK ADA'}`)
    wrn(`  - Solusi: hubungi hosting untuk install python3 atau yt-dlp secara manual`)
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
    const hasFfmpeg = commandExists('ffmpeg') || fs.existsSync(FFMPEG_PATH)
    // Hanya true jika YTDLP_PATH benar-benar ter-set oleh setupYtDlp (artinya bisa dijalankan)
    const hasYtdlp = !!process.env.YTDLP_PATH
    const ytdlpMode = process.env.YTDLP_MODE ? ` via ${process.env.YTDLP_MODE}` : ''
    const ytdlpInfo = hasYtdlp ? `✅ ready${ytdlpMode}` : '❌ tidak bisa dijalankan (radio disabled)'

    console.log('\n' + '─'.repeat(50))
    console.log('  🤖 RonnBot v2.0 — Bootstrap Summary')
    console.log('─'.repeat(50))
    console.log(`  Fonts         : ${fonts.length > 0 ? fonts.join(', ') : 'none'}`)
    console.log(`  FFmpeg        : ${hasFfmpeg ? '✅ available' : '❌ not found (radio disabled)'}`)
    console.log(`  yt-dlp        : ${ytdlpInfo}`)
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