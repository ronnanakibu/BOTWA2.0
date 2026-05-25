module.exports = {
    apps: [{
        name: 'wa-bot-v2',
        script: 'src/core/bot.js',
        watch: false,
        max_memory_restart: '300M',
        restart_delay: 5000,
        env_production: {
            NODE_ENV: 'production'
        }
    }]
}