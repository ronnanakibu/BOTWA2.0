// src/middleware/validator.js
// Input sanitization dasar untuk args command

const MAX_ARG_LENGTH = 500
const MAX_ARGS_COUNT = 20
const DANGEROUS_PATTERNS = [
    /`[^`]*`/g,           // backtick injection
    /<script/gi,          // XSS attempt
    /\$\{[^}]*\}/g,       // template literal injection
]

/**
 * Validasi dan sanitasi args sebelum masuk command.
 * Return { valid: bool, reason: string }
 */
export function validateArgs(args = []) {
    if (args.length > MAX_ARGS_COUNT) {
        return { valid: false, reason: `Terlalu banyak argumen (max ${MAX_ARGS_COUNT})` }
    }

    for (const arg of args) {
        if (arg.length > MAX_ARG_LENGTH) {
            return { valid: false, reason: `Argumen terlalu panjang (max ${MAX_ARG_LENGTH} karakter)` }
        }
        for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(arg)) {
                return { valid: false, reason: 'Input mengandung karakter yang tidak diizinkan' }
            }
        }
    }

    return { valid: true }
}