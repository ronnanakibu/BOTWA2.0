// src/core/loader.js
import { readdirSync, statSync } from 'fs'
import path from 'path'

export const commands = new Map()

export async function loadCommands(dir = './src/commands') {
    const entries = readdirSync(dir)

    for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const isDir = statSync(fullPath).isDirectory()

        if (isDir) {
            await loadCommands(fullPath)  // recursive untuk sub-folder
            continue
        }

        if (!entry.endsWith('.js')) continue

        const mod = await import(`../../${fullPath}`)
        const cmd = mod.default

        if (!cmd?.name) continue

        commands.set(cmd.name, cmd)

        // Register aliases
        if (cmd.aliases) {
            for (const alias of cmd.aliases) {
                commands.set(alias, cmd)
            }
        }

        logger.debug(`Loaded command: ${cmd.name} [${cmd.category}]`)
    }
}