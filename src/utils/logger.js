// src/utils/logger.js
// Terminal logger dengan warna, timestamp, dan per-module tracking
// Setiap proses bot keliatan jelas di terminal

import pino from 'pino'
import pinoPretty from 'pino-pretty'
import fs from 'fs'

// ─────────────────────────────────────────────
// AUTO-CREATE REQUIRED DIRS
// ─────────────────────────────────────────────

const requiredDirs = [
    './storage/logs',
    './storage/sessions',
    './storage/database',
    './storage/media'
]
for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const isProduction = process.env.NODE_ENV === 'production'
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'debug'

// ─────────────────────────────────────────────
// ANSI COLOR CODES — untuk terminal raw logging
// ─────────────────────────────────────────────

const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Background
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
}

// ─────────────────────────────────────────────
// LEVEL CONFIG
// ─────────────────────────────────────────────

const LEVEL_CONFIG = {
    trace: { label: 'TRACE', color: C.gray, bg: '', icon: '·' },
    debug: { label: 'DEBUG', color: C.cyan, bg: '', icon: '🔍' },
    info: { label: 'INFO ', color: C.green, bg: '', icon: '✅' },
    warn: { label: 'WARN ', color: C.yellow, bg: '', icon: '⚠️ ' },
    error: { label: 'ERROR', color: C.red, bg: C.bgRed, icon: '❌' },
    fatal: { label: 'FATAL', color: C.white, bg: C.bgRed, icon: '💀' },
}

// ─────────────────────────────────────────────
// MODULE COLOR MAP — tiap modul punya warna sendiri
// ─────────────────────────────────────────────

const MODULE_COLORS = {
    'bot': C.cyan,
    'connection': C.blue,
    'loader': C.magenta,
    'handler': C.yellow,
    'command': C.green,
    'ai': C.magenta,
    'memory': C.cyan,
    'media': C.blue,
    'reminder': C.yellow,
    'admin': C.red,
    'seamless': C.gray,
    'scheduler': C.yellow,
}

function getModuleColor(module) {
    return MODULE_COLORS[module?.toLowerCase()] ?? C.white
}

// ─────────────────────────────────────────────
// TIMESTAMP
// ─────────────────────────────────────────────

function ts() {
    return new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    })
}

// ─────────────────────────────────────────────
// CORE RAW LOGGER — langsung ke stdout, tanpa pino
// Dipakai untuk log yang butuh format custom & warna
// ─────────────────────────────────────────────

function rawLog(level, module, ...args) {
    const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.info
    const modColor = getModuleColor(module)
    const modLabel = module ? `${modColor}[${module.toUpperCase()}]${C.reset}` : ''

    const timestamp = `${C.gray}${ts()}${C.reset}`
    const levelStr = `${cfg.color}${C.bold}${cfg.label}${C.reset}`
    const icon = cfg.icon

    const message = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)
    ).join(' ')

    process.stdout.write(
        `${timestamp} ${icon} ${levelStr} ${modLabel} ${message}\n`
    )
}

// ─────────────────────────────────────────────
// PINO LOGGER — untuk structured JSON di production
// ─────────────────────────────────────────────

export const logger = isProduction
    ? pino({ level: LOG_LEVEL }, pino.destination('./storage/logs/app.log'))
    : pino({ level: LOG_LEVEL }, pinoPretty({
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
    }))

// ─────────────────────────────────────────────
// BOT LOGGER — custom pretty logger untuk dev
// Ini yang keliatan di terminal saat develop
// ─────────────────────────────────────────────

export const botLogger = {
    // ── Generic levels ──
    trace: (module, ...args) => rawLog('trace', module, ...args),
    debug: (module, ...args) => rawLog('debug', module, ...args),
    info: (module, ...args) => rawLog('info', module, ...args),
    warn: (module, ...args) => rawLog('warn', module, ...args),
    error: (module, ...args) => rawLog('error', module, ...args),
    fatal: (module, ...args) => rawLog('fatal', module, ...args),

    // ── Specialized event loggers ──

    /** Bot startup / system events */
    system: (msg) => {
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} 🤖 ${C.bold}${C.cyan}[SYSTEM]${C.reset} ${msg}\n`
        )
    },

    /** Incoming message */
    message: ({ sender, type, body, isGroup, chatId }) => {
        const from = isGroup
            ? `${C.yellow}[GROUP]${C.reset} ${C.dim}${chatId?.slice(0, 20)}${C.reset}`
            : `${C.green}[DM]${C.reset}   ${C.dim}${sender?.slice(0, 20)}${C.reset}`
        const bodyPreview = body?.slice(0, 60) + (body?.length > 60 ? '…' : '')
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} 📩 ${C.bold}MSG${C.reset}   ${from} ${C.dim}type=${type}${C.reset} ${C.white}"${bodyPreview}"${C.reset}\n`
        )
    },

    /** Command execution */
    command: (name, sender, args = []) => {
        const argsStr = args.length ? `${C.dim}[${args.slice(0, 3).join(', ')}]${C.reset}` : ''
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} 🚀 ${C.bold}${C.green}CMD${C.reset}    ${C.bold}${name}${C.reset} ${C.dim}← ${sender?.slice(0, 20)}${C.reset} ${argsStr}\n`
        )
    },

    /** Command result */
    commandDone: (name, ms) => {
        const speed = ms < 500 ? C.green : ms < 2000 ? C.yellow : C.red
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} ✅ ${C.bold}DONE${C.reset}   ${C.bold}${name}${C.reset} ${speed}(${ms}ms)${C.reset}\n`
        )
    },

    /** AI call */
    ai: (provider, model, chatId, ms = null) => {
        const msStr = ms !== null ? ` ${C.dim}${ms}ms${C.reset}` : ''
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} 🤖 ${C.bold}${C.magenta}AI${C.reset}     ${C.bold}${provider}/${model}${C.reset} → ${C.dim}${chatId?.slice(0, 25)}${C.reset}${msStr}\n`
        )
    },

    /** AI route trigger (seamless/mention/dm) */
    aiTrigger: (route, preview) => {
        const routeColors = { seamless: C.cyan, mention: C.yellow, dm: C.green }
        const color = routeColors[route] ?? C.white
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} 💬 ${color}${C.bold}[${route.toUpperCase()}]${C.reset} "${preview?.slice(0, 60)}"\n`
        )
    },

    /** Admin/group action */
    admin: (action, target, by) => {
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} 👑 ${C.bold}${C.red}ADMIN${C.reset}  ${C.bold}${action}${C.reset} → ${C.dim}${target}${C.reset} ${C.gray}by ${by?.slice(0, 20)}${C.reset}\n`
        )
    },

    /** Reminder fired */
    reminder: (id, chatId) => {
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} ⏰ ${C.bold}${C.yellow}REMIND${C.reset} #${id} → ${C.dim}${chatId?.slice(0, 25)}${C.reset}\n`
        )
    },

    /** Media processing */
    media: (type, ms = null) => {
        const msStr = ms !== null ? ` ${C.dim}${ms}ms${C.reset}` : ''
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} 🎨 ${C.bold}${C.blue}MEDIA${C.reset}  ${type}${msStr}\n`
        )
    },

    /** Connection events */
    connect: (status, detail = '') => {
        const icon = status === 'open' ? '🟢' : status === 'close' ? '🔴' : '🟡'
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} ${icon} ${C.bold}CONN${C.reset}   ${status.toUpperCase()} ${C.dim}${detail}${C.reset}\n`
        )
    },

    /** Error dengan stack trace opsional */
    err: (module, err, context = '') => {
        const errMsg = err instanceof Error ? err.message : String(err)
        const stack = err instanceof Error && err.stack
            ? `\n${C.dim}${err.stack.split('\n').slice(1, 4).join('\n')}${C.reset}`
            : ''
        process.stdout.write(
            `${C.gray}${ts()}${C.reset} ❌ ${C.bold}${C.red}ERROR${C.reset}  ${C.red}[${module}]${C.reset} ${context ? C.dim + context + ' ' + C.reset : ''}${errMsg}${stack}\n`
        )
    },

    /** Separator / section header */
    section: (title) => {
        const line = '─'.repeat(50)
        process.stdout.write(`\n${C.dim}${line}\n  ${title}\n${line}${C.reset}\n\n`)
    },

    /** Raw divider */
    divider: () => {
        process.stdout.write(`${C.dim}${'─'.repeat(60)}${C.reset}\n`)
    }
}

// ─────────────────────────────────────────────
// CHILD LOGGERS — backward compat + module-specific
// ─────────────────────────────────────────────

export const connLogger = { ...logger.child({ module: 'connection' }), bot: (m, ...a) => botLogger.info('connection', m, ...a) }
export const cmdLogger = { ...logger.child({ module: 'commands' }), bot: (m, ...a) => botLogger.info('command', m, ...a) }
export const aiLogger = { ...logger.child({ module: 'ai' }), bot: (m, ...a) => botLogger.info('ai', m, ...a) }
export const mediaLogger = { ...logger.child({ module: 'media' }), bot: (m, ...a) => botLogger.info('media', m, ...a) }
export const adminLogger = { ...logger.child({ module: 'admin' }), bot: (m, ...a) => botLogger.info('admin', m, ...a) }