// src/commands/owner/files.js
// !files — Owner-only filesystem access
// Bisa lihat, baca, dan edit source code bot langsung via WA

import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = path.resolve('.')
const ALLOWED_EXTENSIONS = ['.js', '.json', '.md', '.env', '.txt', '.yaml', '.yml']
const MAX_FILE_SIZE = 30_000
const MAX_REPLY_LENGTH = 3_500

function isPathSafe(targetPath) {
    const resolved = path.resolve(targetPath)
    return resolved.startsWith(PROJECT_ROOT)
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default {
    name: 'files',
    aliases: ['fs', 'file', 'src'],
    category: 'owner',
    description: '[OWNER] Akses filesystem bot — lihat, baca, edit source code',
    usage: '!files [ls|cat|edit|tree] [path] [content?]',
    cooldown: 2,
    permissions: ['owner'],

    async execute(ctx) {
        const { args, reply, react, sender, from, msg, messageContent, sock } = ctx

        // Guard owner — double check di level command
        const ownerNumber = process.env.OWNER_NUMBER?.replace(/[^0-9]/g, '')
        const senderNumber = sender?.replace(/[^0-9@].*/, '').replace(/[^0-9]/g, '')
        if (senderNumber !== ownerNumber) return reply('⛔ Akses ditolak.')

        const subCmd = args[0]?.toLowerCase()

        // ── ls ── List direktori
        if (!subCmd || subCmd === 'ls') {
            const targetDir = args[1] ? path.join('.', args[1]) : '.'
            if (!isPathSafe(targetDir)) return reply('⛔ Path tidak diizinkan.')

            try {
                const entries = fs.readdirSync(targetDir, { withFileTypes: true })
                const IGNORE = ['node_modules', '.git', 'sessions']
                let text = `📁 *${path.resolve(targetDir).replace(PROJECT_ROOT, '.')}*\n\n`
                entries
                    .filter(e => !IGNORE.includes(e.name))
                    .sort((a, b) => b.isDirectory() - a.isDirectory() || a.name.localeCompare(b.name))
                    .forEach(e => {
                        if (e.isDirectory()) {
                            text += `📂 ${e.name}/\n`
                        } else {
                            const stat = fs.statSync(path.join(targetDir, e.name))
                            text += `📄 ${e.name} _(${formatSize(stat.size)})_\n`
                        }
                    })
                await reply(text || '_Folder kosong_')
            } catch (err) { await reply(`❌ ${err.message}`) }
            return
        }

        // ── cat ── Baca isi file
        if (subCmd === 'cat' || subCmd === 'read') {
            if (!args[1]) return reply('*Usage:* !files cat [path]\nContoh: !files cat src/commands/ai/q.js')
            const targetFile = path.join('.', args.slice(1).join(' '))
            if (!isPathSafe(targetFile)) return reply('⛔ Path tidak diizinkan.')
            if (!ALLOWED_EXTENSIONS.includes(path.extname(targetFile)))
                return reply(`⛔ Ekstensi tidak diizinkan. Boleh: ${ALLOWED_EXTENSIONS.join(', ')}`)
            try {
                const stat = fs.statSync(targetFile)
                if (!stat.isFile()) return reply('❌ Bukan file.')
                if (stat.size > MAX_FILE_SIZE) return reply(`❌ File terlalu besar (${formatSize(stat.size)}). Max 30KB.`)
                const content = fs.readFileSync(targetFile, 'utf8')
                const filename = path.basename(targetFile)
                if (content.length > MAX_REPLY_LENGTH) {
                    await sock.sendMessage(from, {
                        document: Buffer.from(content, 'utf8'),
                        fileName: filename,
                        mimetype: 'text/plain',
                        caption: `📄 *${filename}* _(${formatSize(stat.size)}, ${content.split('\n').length} baris)_`
                    }, { quoted: msg })
                } else {
                    await reply(`📄 *${filename}* _(${content.split('\n').length} baris)_\n\n\`\`\`\n${content}\n\`\`\``)
                }
            } catch (err) { await reply(`❌ ${err.message}`) }
            return
        }

        // ── edit ── Tulis/update file
        if (subCmd === 'edit' || subCmd === 'write') {
            if (!args[1]) return reply('*Usage:* !files edit [path] [content]\nAtau reply kode dengan !files edit [path]')
            const targetFile = path.join('.', args[1])
            if (!isPathSafe(targetFile)) return reply('⛔ Path tidak diizinkan.')
            if (!ALLOWED_EXTENSIONS.includes(path.extname(targetFile)))
                return reply(`⛔ Ekstensi tidak diizinkan.`)

            const quotedText = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
                ?? messageContent?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text

            const newContent = (args.length === 2 && quotedText)
                ? quotedText
                : args.slice(2).join(' ')

            if (!newContent?.trim()) return reply('❌ Content tidak boleh kosong. Kirim content di args atau reply pesan kode.')

            try {
                const dir = path.dirname(targetFile)
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
                const exists = fs.existsSync(targetFile)
                if (exists) fs.copyFileSync(targetFile, targetFile + '.bak')
                fs.writeFileSync(targetFile, newContent, 'utf8')
                await react('✅')
                await reply(
                    `✅ *${exists ? 'Updated' : 'Created'}:* ${targetFile}\n` +
                    `📊 ${newContent.split('\n').length} baris, ${formatSize(Buffer.byteLength(newContent))}\n` +
                    `${exists ? '💾 Backup: ' + path.basename(targetFile) + '.bak' : ''}`
                )
            } catch (err) { await reply(`❌ Gagal tulis: ${err.message}`) }
            return
        }

        // ── tree ── Struktur folder
        if (subCmd === 'tree') {
            const maxDepth = parseInt(args[1]) || 2
            const IGNORE = ['node_modules', '.git', 'sessions', 'database', 'fontcache']

            const buildTree = (dir, depth = 0, prefix = '') => {
                if (depth > maxDepth) return ''
                let result = ''
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true })
                        .filter(e => !IGNORE.some(i => e.name.includes(i)))
                        .sort((a, b) => b.isDirectory() - a.isDirectory() || a.name.localeCompare(b.name))
                    entries.forEach((e, i) => {
                        const isLast = i === entries.length - 1
                        const icon = e.isDirectory() ? '📂' : '📄'
                        result += `${prefix}${isLast ? '└── ' : '├── '}${icon} ${e.name}\n`
                        if (e.isDirectory()) {
                            result += buildTree(path.join(dir, e.name), depth + 1, prefix + (isLast ? '    ' : '│   '))
                        }
                    })
                } catch (_) { }
                return result
            }

            const tree = buildTree('.')
            await reply(`🌳 *Project Tree (depth ${maxDepth})*\n\n\`\`\`\n${tree.slice(0, MAX_REPLY_LENGTH)}\`\`\``)
            return
        }

        await reply(
            `📁 *!files — Filesystem Access*\n\n` +
            `• \`!files ls [path]\` — List folder\n` +
            `• \`!files cat [path]\` — Baca file\n` +
            `• \`!files edit [path] [content]\` — Edit file\n` +
            `• \`!files tree [depth]\` — Struktur folder\n\n` +
            `_Path traversal diblokir. Hanya dalam project root._`
        )
    }
}