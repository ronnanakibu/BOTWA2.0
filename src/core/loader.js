// src/core/loader.js
import { readdirSync, statSync } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { logger } from '../utils/logger.js'

export const commands = new Map()

export async function loadCommands(dir = './src/commands') {
    console.log(`🔍 [Debug Loader] Sedang memindai direktori: ${dir}`)
    let entries = []

    try {
        entries = readdirSync(dir)
        console.log(`📁 [Debug Loader] Isi folder ${dir}:`, entries)
    } catch (err) {
        console.error(`❌ [Debug Loader] Gagal membaca folder ${dir}:`, err.message)
        return
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const isDir = statSync(fullPath).isDirectory()

        if (isDir) {
            await loadCommands(fullPath)
            continue
        }

        if (!entry.endsWith('.js')) continue

        try {
            // ✅ FIX: pakai path absolute + file:// URL
            // Sebelumnya: import(`../../${fullPath}`) → path relatif kacau
            // Sekarang: import(fileURL) → selalu resolve dari root project
            const absolutePath = path.resolve(fullPath)
            const fileURL = pathToFileURL(absolutePath).href

            const mod = await import(fileURL)
            const cmd = mod.default

            if (!cmd) {
                console.log(`⚠️ [Debug Loader] Berkas ${entry} tidak memiliki 'export default'!`)
                continue
            }
            if (!cmd.name) {
                console.log(`⚠️ [Debug Loader] Berkas ${entry} kehilangan properti 'name'!`)
                continue
            }

            commands.set(cmd.name, cmd)

            if (cmd.aliases) {
                for (const alias of cmd.aliases) {
                    commands.set(alias, cmd)
                }
            }

            console.log(`✅ [Debug Loader] SUKSES memuat command: ${cmd.name} (Aliases: ${cmd.aliases?.join(', ') || 'tidak ada'})`)
            logger.info(`Loaded command: ${cmd.name} [${cmd.category}]`)

        } catch (importErr) {
            console.error(`❌ [Debug Loader] Gagal import ${fullPath}:`, importErr.message)
        }
    }
}