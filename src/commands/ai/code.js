// src/commands/ai/code.js
// !code — AI Code Debugger
// Alias: !debug, !fix

import { aiService } from '../../services/ai.js'

export default {
    name: 'code',
    aliases: ['debug', 'fix', 'review'],
    category: 'ai',
    description: 'Debug atau review kode dengan AI.',
    usage: '!code [kode] atau reply pesan berisi kode',
    example: '!code console.log("hello"',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, msg } = ctx

        // Ambil kode dari: args langsung, atau quoted message
        let code = ''
        let language = 'auto'

        const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
            ?? msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text

        if (quotedText) {
            // Reply ke pesan berisi kode
            code = quotedText

            // Cek kalau ada bahasa di args: !code python
            if (args.length) language = args[0]

        } else if (args.length) {
            // Kode langsung di args
            // Format: !code js const x = 1
            const KNOWN_LANGS = ['js', 'javascript', 'python', 'py', 'java', 'c', 'cpp', 'go', 'php', 'ts', 'typescript', 'rust']
            if (KNOWN_LANGS.includes(args[0].toLowerCase())) {
                language = args.shift()
            }
            code = args.join(' ')
        }

        if (!code.trim()) {
            return reply(
                `*Cara pakai:*\n` +
                `1. Ketik kode langsung: !code [kode]\n` +
                `2. Reply pesan kode dengan !code\n` +
                `3. Tambah bahasa: !code python [kode]\n\n` +
                `_Bot akan debug, jelaskan error, dan kasih solusi._`
            )
        }

        await react('🔍')

        try {
            const result = await aiService.debugCode(code, language)
            await reply(result.text)
            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`Gagal debug kode: ${err.message}`)
        }
    }
}