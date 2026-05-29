// src/commands/group/add.js
// !add — Tambahkan member ke grup via nomor HP
// Alias: !tambah, !invite

import { groupGuard } from '../../middleware/groupGuard.js'

/**
 * Normalize phone number ke format JID WhatsApp
 * 08xxx → 628xxx@s.whatsapp.net
 * 628xxx → 628xxx@s.whatsapp.net
 * +628xxx → 628xxx@s.whatsapp.net
 */
function normalizeToJid(phone) {
    const cleaned = phone.replace(/[+\s\-().]/g, '').replace(/^0/, '62')
    if (!/^\d{10,15}$/.test(cleaned)) return null
    return `${cleaned}@s.whatsapp.net`
}

export default {
    name: 'add',
    aliases: ['tambah', 'addmember'],
    category: 'group',
    description: '[ADMIN] Tambahkan member ke grup.',
    usage: '!add [nomor HP]',
    example: '!add 628123456789 atau !add 0812345678',
    cooldown: 5,
    permissions: ['admin'],

    async execute(ctx) {
        const { args, reply, react, sock, chatId } = ctx

        const guard = await groupGuard(ctx)
        if (!guard.ok) return

        if (!args.length) {
            return reply(
                `❌ Kasih nomor HP-nya.\n\n` +
                `*Cara pakai:*\n` +
                `• !add 628xxxxxxxxxxxx\n` +
                `• !add 08xxxxxxxxxxxx\n\n` +
                `_Bisa tambah beberapa sekaligus:_\n` +
                `!add 628xxx 628yyy 628zzz`
            )
        }

        // Support add multiple sekaligus
        const targets = args
            .map(a => ({ raw: a, jid: normalizeToJid(a) }))
            .filter(t => t.jid !== null)

        const invalid = args.filter(a => !normalizeToJid(a))

        if (!targets.length) {
            return reply(`❌ Format nomor tidak valid.\n\nGunakan format: 628xxx atau 08xxx`)
        }

        await react('⏳')

        const results = { success: [], failed: [], notOnWA: [] }

        for (const target of targets) {
            try {
                // Cek apakah nomor terdaftar di WhatsApp dulu
                const [result] = await sock.onWhatsApp(target.jid)

                if (!result?.exists) {
                    results.notOnWA.push(target.raw)
                    continue
                }

                // Cek apakah sudah ada di grup
                const meta = await sock.groupMetadata(chatId)
                const alreadyIn = meta.participants.some(
                    p => p.id.replace(/:\d+@/, '@') === target.jid.replace(/:\d+@/, '@')
                )

                if (alreadyIn) {
                    results.failed.push({ num: target.raw, reason: 'Sudah ada di grup' })
                    continue
                }

                const addResult = await sock.groupParticipantsUpdate(chatId, [target.jid], 'add')

                // Parse result — Baileys return array of status
                const status = addResult?.[0]?.status

                if (status === '200' || status === 200) {
                    results.success.push(target.raw)
                } else if (status === '403') {
                    results.failed.push({ num: target.raw, reason: 'Privacy setting tidak mengizinkan' })
                } else if (status === '408') {
                    results.failed.push({ num: target.raw, reason: 'Tidak merespons (mungkin link invite lebih cocok)' })
                } else {
                    results.failed.push({ num: target.raw, reason: `Status: ${status}` })
                }

            } catch (err) {
                results.failed.push({ num: target.raw, reason: err.message })
            }
        }

        await react('✅')

        // Build response
        let response = `📋 *Hasil Add Member:*\n\n`

        if (results.success.length) {
            response += `✅ *Berhasil (${results.success.length}):*\n`
            response += results.success.map(n => `  • ${n}`).join('\n') + '\n\n'
        }

        if (results.notOnWA.length) {
            response += `📵 *Tidak terdaftar di WA (${results.notOnWA.length}):*\n`
            response += results.notOnWA.map(n => `  • ${n}`).join('\n') + '\n\n'
        }

        if (results.failed.length) {
            response += `❌ *Gagal (${results.failed.length}):*\n`
            response += results.failed.map(f => `  • ${f.num}: ${f.reason}`).join('\n')
        }

        if (invalid.length) {
            response += `\n\n⚠️ *Format tidak valid:* ${invalid.join(', ')}`
        }

        await reply(response.trim())
    }
}