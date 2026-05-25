// src/utils/logger.js
import pino from 'pino'
import pinoPretty from 'pino-pretty'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
}, isProduction
    ? pino.destination('./storage/logs/app.log')  // file di prod
    : pinoPretty({ colorize: true, translateTime: 'SYS:HH:MM:ss' })
)

// Child loggers per module
export const connLogger = logger.child({ module: 'connection' })
export const cmdLogger = logger.child({ module: 'commands' })