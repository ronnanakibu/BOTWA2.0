// src/commands/owner/src.js
// !src — Owner-only: baca, list, dan edit source code bot secara langsung dari WA
// FIX: PROJECT_ROOT resolve dari process.cwd(), bukan dari file lokasi
// FIX: silent react ❌ sekarang ada error message yang jelas
// FIX: prefix support ! maupun /

import fs from 'fs'
import path from 'path'
import { isOwner } from '../../middleware/permission.js'

// ─────────────────────────────────────────────
// ROOT — resolve dari CWD (root project), bukan dari lokasi file ini
// Dulu: path.resolve('./src') → bisa salah kalau CWD berbeda
// Sekarang: selalu dari root project
// ─────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(process.cwd(), 'src')

const ALLOWED_EXT = ['.js', '.json', '.md', '.env.example', '.txt']
const BLOCKED_PATHS = ['node_modules', '.env', 'storage', '.git']

function isBlocked(filePath) {
    const rel = path.relative(process.cwd(), filePath)
    return BLOCKED_PATHS.some(b => rel.split(path.sep).includes(b) || rel.startsWith(b))
}

function isAllowedExt(filePath) {
    return ALLOWED_EXT.some(ext => filePath.endsWith(ext))
}

function listDir(dirPath, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return ''
    let result = ''
    try {
        const entries = fs.readdirSync(dirPath).sort()
        for (const entry of entries) {
            if (entry.startsWith('.')) continue
            const full = path.join(dirPath, entry)
            const stat = fs.statSync(full)
            const indent = '  '.repeat(depth)
            if (stat.isDirectory()) {
                result += `${indent}📁 ${entry}/\n`
                result += listDir(full, depth + 1, maxDepth)
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
    usage: '!src list | !src read <path> | !src write <path>',
    cooldown: 2,
    permissions: ['owner'],

    async execute(ctx) {
        const { args, reply, react, msg, sender } = ctx

        // ── OWNER GUARD ───────────────────────────────
        // FIX: pakai isBotOwner() yang sudah handle format nomor
        if (!isOwner(sender)) {
            await react('🚫')
            // Jangan silent — kasih tau kenapa gagal (hanya di console, WA silent)
            console.warn(`[src] Akses ditolak dari: ${sender}`)
            return
        }

        const sub = (args[0] ?? 'list').toLowerCase()

        // ─────────────────────────────────────────────
        // LIST
        // ─────────────────────────────────────────────
        if (sub === 'list' || sub === 'ls') {
            const targetFolder = args[1]
                ? path.resolve(PROJECT_ROOT, args[1])
                : PROJECT_ROOT

            if (isBlocked(targetFolder)) {
                return reply('🚫 Path ini diblokir.')
            }
            if (!fs.existsSync(targetFolder)) {
                return reply(`❌ Folder tidak ditemukan: ${args[1] ?? 'src'}`)
            }

            const tree = listDir(targetFolder)
            const rel = path.relative(process.cwd(), targetFolder)
            return reply(`📁 *${rel}/*\n\n${tree || '(kosong)'}`)
        }

        // ─────────────────────────────────────────────
        // READ
        // ─────────────────────────────────────────────
        if (sub === 'read' || sub === 'cat' || sub === 'show') {
            const filePath = args[1]
            if (!filePath) {
                return reply('❌ Kasih path file.\nContoh: !src read commands/ai/q.js')
            }

            const resolved = path.resolve(PROJECT_ROOT, filePath)

            if (isBlocked(resolved)) return reply('🚫 File ini diblokir.')
            if (!isAllowedExt(resolved)) return reply(`🚫 Ekstensi tidak diizinkan.`)
            if (!fs.existsSync(resolved)) return reply(`❌ File tidak ditemukan: ${filePath}`)

            try {
                const content = fs.readFileSync(resolved, 'utf-8')
                const rel = path.relative(process.cwd(), resolved)
                const MAX = 3500
                const truncated = content.length > MAX
                    ? content.slice(0, MAX) + `\n\n... [+${content.length - MAX} chars dipotong]`
                    : content

                return reply(`📄 *${rel}*\n\`\`\`\n${truncated}\n\`\`\``)
            } catch (e) {
                await react('❌')
                return reply(`❌ Gagal baca file: ${e.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // WRITE — reply ke pesan kode baru + ketik !src write <path>
        // ─────────────────────────────────────────────
        if (sub === 'write' || sub === 'save') {
            const filePath = args[1]
            if (!filePath) return reply('❌ Kasih path file.\nContoh: !src write commands/ai/q.js')

            // Ambil konten dari quoted message
            const quotedText =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
                ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text
                ?? null

            if (!quotedText) {
                return reply(
                    '❌ Reply ke pesan berisi kode baru dulu, baru ketik !src write <path>\n\n' +
                    '_Cara: kirim kodenya → reply pesan kode itu dengan !src write namefile.js_'
                )
            }

            const resolved = path.resolve(PROJECT_ROOT, filePath)
            if (isBlocked(resolved)) return reply('🚫 File ini diblokir.')
            if (!isAllowedExt(resolved)) return reply('🚫 Ekstensi tidak diizinkan.')

            const parentDir = path.dirname(resolved)
            if (!fs.existsSync(parentDir)) {
                return reply(`❌ Folder tidak ditemukan: ${path.relative(process.cwd(), parentDir)}`)
            }

            try {
                // Auto backup sebelum overwrite
                if (fs.existsSync(resolved)) {
                    fs.copyFileSync(resolved, resolved + '.bak')
                }
                fs.writeFileSync(resolved, quotedText, 'utf-8')
                const rel = path.relative(process.cwd(), resolved)
                await react('✅')
                return reply(`✅ *${rel}* berhasil disimpan!\n_Backup: ${rel}.bak_`)
            } catch (e) {
                await react('❌')
                return reply(`❌ Gagal tulis file: ${e.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // DELETE
        // ─────────────────────────────────────────────
        if (sub === 'delete' || sub === 'del' || sub === 'rm') {
            const filePath = args[1]
            const confirm = args[2]

            if (!filePath) return reply('❌ Kasih path file.')
            if (confirm !== '--confirm') {
                return reply(
                    `⚠️ Yakin hapus *${filePath}*?\n\n` +
                    `Ketik: !src delete ${filePath} --confirm`
                )
            }

            const resolved = path.resolve(PROJECT_ROOT, filePath)
            if (isBlocked(resolved)) return reply('🚫 File ini diblokir.')
            if (!fs.existsSync(resolved)) return reply('❌ File tidak ada.')

            try {
                fs.copyFileSync(resolved, resolved + '.deleted')
                fs.unlinkSync(resolved)
                await react('🗑️')
                return reply(`🗑️ *${filePath}* dihapus.\n_Backup: ${filePath}.deleted_`)
            } catch (e) {
                await react('❌')
                return reply(`❌ Gagal hapus: ${e.message}`)
            }
        }

        // ─────────────────────────────────────────────
        // HELP (fallback)
        // ─────────────────────────────────────────────
        return reply(
            `*🗂️ !src — Owner File System*\n\n` +
            `*!src list [folder]* — List isi folder\n` +
            `*!src read <path>* — Baca isi file\n` +
            `*!src write <path>* — Overwrite file (reply ke kode baru)\n` +
            `*!src delete <path> --confirm* — Hapus file\n\n` +
            `_Path relatif dari folder src/_\n` +
            `_Contoh: !src read commands/ai/q.js_`
        )
    }
}