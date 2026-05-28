// src/commands/owner/src.js
// !src — Owner-only: baca, list, dan edit source code bot secara langsung dari WA
// Alias: !source, !fs

import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = path.resolve('./src')

// Ekstensi yang boleh dibaca/diedit
const ALLOWED_EXT = ['.js', '.json', '.env.example', '.md']

// Path yang DILARANG diakses (keamanan)
const BLOCKED_PATHS = [
    'storage',
    '.env',
    'node_modules',
]

function isBlocked(filePath) {
    const rel = path.relative(process.cwd(), filePath)
    return BLOCKED_PATHS.some(b => rel.startsWith(b) || rel.includes(b))
}

function isAllowedExt(filePath) {
    return ALLOWED_EXT.some(ext => filePath.endsWith(ext))
}

function listDir(dirPath, depth = 0) {
    if (depth > 3) return ''
    let result = ''
    try {
        const entries = fs.readdirSync(dirPath)
        for (const entry of entries) {
            const full = path.join(dirPath, entry)
            const stat = fs.statSync(full)
            const indent = '  '.repeat(depth)
            if (stat.isDirectory()) {
                result += `${indent}📁 ${entry}/\n`
                result += listDir(full, depth + 1)
            } else {
                result += `${indent}📄 ${entry}\n`
            }
        }
    } catch (e) {
        result += `(error: ${e.message})\n`
    }
    return result
}

export default {
    name: 'src',
    aliases: ['source', 'fs', 'code-owner'],
    category: 'owner',
    description: '[OWNER] Baca, list, atau edit source code bot.',
    usage: '!src list | !src read <path> | !src edit <path> | reply kode baru + !src write <path>',
    cooldown: 2,
    permissions: ['owner'],

    async execute(ctx) {
        const { args, reply, react, msg, sender } = ctx

        // 🔐 OWNER GUARD
        const ownerNumber = process.env.OWNER_NUMBER?.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        if (sender !== ownerNumber) {
            return react('🚫')
        }

        const subcommand = args[0]?.toLowerCase()

        // ─────────────────────────────────────────────
        // !src list [folder]
        // ─────────────────────────────────────────────
        if (!subcommand || subcommand === 'list') {
            const targetDir = args[1]
                ? path.resolve(PROJECT_ROOT, args[1])
                : PROJECT_ROOT

            if (isBlocked(targetDir)) {
                return reply('🚫 Path ini diblokir.')
            }

            if (!fs.existsSync(targetDir)) {
                return reply(`❌ Folder tidak ditemukan: ${args[1] ?? 'src'}`)
            }

            const tree = listDir(targetDir)
            return reply(`📁 *Struktur ${path.relative(process.cwd(), targetDir)}*\n\n${tree}`)
        }

        // ─────────────────────────────────────────────
        // !src read <path>
        // !src cat <path>
        // ─────────────────────────────────────────────
        if (subcommand === 'read' || subcommand === 'cat' || subcommand === 'show') {
            const filePath = args[1]
            if (!filePath) return reply('❌ Kasih path file-nya.\nContoh: !src read commands/ai/q.js')

            const resolved = path.resolve(PROJECT_ROOT, filePath)

            if (isBlocked(resolved)) return reply('🚫 File ini diblokir.')
            if (!isAllowedExt(resolved)) return reply(`🚫 Ekstensi tidak diizinkan. Allowed: ${ALLOWED_EXT.join(', ')}`)
            if (!fs.existsSync(resolved)) return reply(`❌ File tidak ditemukan: ${filePath}`)

            try {
                const content = fs.readFileSync(resolved, 'utf-8')
                const relPath = path.relative(process.cwd(), resolved)

                // Potong kalau terlalu panjang (WA limit ~65kb)
                const MAX_CHARS = 3000
                const truncated = content.length > MAX_CHARS
                    ? content.slice(0, MAX_CHARS) + `\n\n... [truncated ${content.length - MAX_CHARS} chars]`
                    : content

                return reply(`📄 *${relPath}*\n\`\`\`\n${truncated}\n\`\`\``)
            } catch (e) {
                return reply(`❌ Gagal baca file: ${e.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !src edit <path>
        // Tampilkan file saat ini, siap di-reply
        // ─────────────────────────────────────────────
        if (subcommand === 'edit') {
            const filePath = args[1]
            if (!filePath) return reply('❌ Kasih path file-nya.')

            const resolved = path.resolve(PROJECT_ROOT, filePath)
            if (isBlocked(resolved)) return reply('🚫 File ini diblokir.')
            if (!isAllowedExt(resolved)) return reply(`🚫 Ekstensi tidak diizinkan.`)
            if (!fs.existsSync(resolved)) return reply(`❌ File tidak ditemukan.`)

            const content = fs.readFileSync(resolved, 'utf-8')
            const relPath = path.relative(process.cwd(), resolved)

            return reply(
                `📝 *Edit mode: ${relPath}*\n` +
                `Reply pesan ini dengan konten baru, lalu kirim:\n` +
                `*!src write ${filePath}*\n\n` +
                `Konten saat ini:\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``
            )
        }

        // ─────────────────────────────────────────────
        // !src write <path>
        // Reply ke pesan berisi kode baru → overwrite file
        // ─────────────────────────────────────────────
        if (subcommand === 'write' || subcommand === 'save') {
            const filePath = args[1]
            if (!filePath) return reply('❌ Kasih path file-nya.')

            // Ambil konten baru dari quoted message
            const quotedText =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
                ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text

            if (!quotedText) {
                return reply('❌ Reply ke pesan berisi kode baru dulu, baru ketik !src write <path>')
            }

            const resolved = path.resolve(PROJECT_ROOT, filePath)
            if (isBlocked(resolved)) return reply('🚫 File ini diblokir.')
            if (!isAllowedExt(resolved)) return reply(`🚫 Ekstensi tidak diizinkan.`)

            // Pastikan parent folder ada
            const parentDir = path.dirname(resolved)
            if (!fs.existsSync(parentDir)) {
                return reply(`❌ Folder tidak ditemukan: ${path.relative(process.cwd(), parentDir)}`)
            }

            try {
                // Backup dulu sebelum overwrite
                if (fs.existsSync(resolved)) {
                    const backupPath = resolved + '.bak'
                    fs.copyFileSync(resolved, backupPath)
                }

                fs.writeFileSync(resolved, quotedText, 'utf-8')
                const relPath = path.relative(process.cwd(), resolved)
                await react('✅')
                return reply(`✅ File berhasil ditulis: *${relPath}*\nBackup disimpan di ${relPath}.bak`)
            } catch (e) {
                return reply(`❌ Gagal tulis file: ${e.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // !src delete <path> — dengan konfirmasi
        // ─────────────────────────────────────────────
        if (subcommand === 'delete' || subcommand === 'rm') {
            const filePath = args[1]
            const confirm = args[2]

            if (!filePath) return reply('❌ Kasih path file-nya.')
            if (confirm !== '--confirm') {
                return reply(
                    `⚠️ Yakin hapus *${filePath}*?\n` +
                    `Ketik: !src delete ${filePath} --confirm`
                )
            }

            const resolved = path.resolve(PROJECT_ROOT, filePath)
            if (isBlocked(resolved)) return reply('🚫 File ini diblokir.')
            if (!fs.existsSync(resolved)) return reply('❌ File tidak ada.')

            try {
                // Backup dulu
                const backupPath = resolved + '.deleted'
                fs.copyFileSync(resolved, backupPath)
                fs.unlinkSync(resolved)
                await react('🗑️')
                return reply(`🗑️ File dihapus: *${filePath}*\nBackup: ${filePath}.deleted`)
            } catch (e) {
                return reply(`❌ Gagal hapus: ${e.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // Help
        // ─────────────────────────────────────────────
        return reply(
            `*🗂️ !src — Owner File System*\n\n` +
            `*!src list [folder]*\nList isi folder (default: src/)\n\n` +
            `*!src read <path>*\nBaca isi file\nContoh: !src read commands/ai/q.js\n\n` +
            `*!src edit <path>*\nTampilkan file untuk diedit\n\n` +
            `*!src write <path>*\nReply kode baru + ketik ini untuk overwrite\n\n` +
            `*!src delete <path> --confirm*\nHapus file (backup otomatis)\n\n` +
            `_Path relatif dari folder src/_`
        )
    }
}