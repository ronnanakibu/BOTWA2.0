// src/commands/utility/kalkulator.js
// !kalkulator — Evaluasi ekspresi matematika (safe eval)

export default {
    name: 'kalkulator',
    aliases: ['calc', 'hitung', 'math'],
    category: 'utility',
    description: 'Evaluasi ekspresi matematika',
    usage: '!kalkulator [ekspresi]',
    example: '!kalkulator (25 * 4) + sqrt(16) / 2',
    cooldown: 2,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react } = ctx
        if (!args.length) return reply('*Usage:* !kalkulator [ekspresi]\n\nContoh:\n!kalkulator 25 * 4 + 10\n!kalkulator sqrt(144)\n!kalkulator 2^10')

        const expr = args.join(' ')
            .replace(/x/gi, '*')      // 2x3 → 2*3
            .replace(/\^/g, '**')     // 2^10 → 2**10
            .replace(/sqrt\(/g, 'Math.sqrt(')
            .replace(/abs\(/g, 'Math.abs(')
            .replace(/ceil\(/g, 'Math.ceil(')
            .replace(/floor\(/g, 'Math.floor(')
            .replace(/round\(/g, 'Math.round(')
            .replace(/log\(/g, 'Math.log10(')
            .replace(/ln\(/g, 'Math.log(')
            .replace(/sin\(/g, 'Math.sin(')
            .replace(/cos\(/g, 'Math.cos(')
            .replace(/tan\(/g, 'Math.tan(')
            .replace(/pi/gi, 'Math.PI')
            .replace(/e(?![a-zA-Z])/g, 'Math.E')

        // Validasi: hanya izinkan karakter matematika — blokir injection
        const isSafe = /^[\d\s\+\-\*\/\.\(\)\%Math\.sqrtabsceilflooroundlogsincoatnPIE]*$/.test(expr)
        if (!isSafe) return reply('❌ Ekspresi tidak valid. Hanya operator matematika yang diizinkan.')

        try {
            // eslint-disable-next-line no-new-func
            const result = Function(`"use strict"; return (${expr})`)()

            if (typeof result !== 'number' || !isFinite(result)) {
                return reply('❌ Hasil tidak valid (mungkin dibagi nol atau overflow).')
            }

            // Format hasil: bulatkan kalau desimalnya panjang
            const formatted = Number.isInteger(result)
                ? result.toLocaleString('id-ID')
                : parseFloat(result.toFixed(10)).toString()

            await reply(
                `🧮 *Kalkulator*\n\n` +
                `*Input:* \`${args.join(' ')}\`\n` +
                `*Hasil:* \`${formatted}\``
            )
        } catch (err) {
            await reply(`❌ Ekspresi tidak bisa dihitung: ${err.message}`)
        }
    }
}