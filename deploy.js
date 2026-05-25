// deploy.js
import deploy from 'deploy-sftp'

deploy({
    host: 'ap2.nzb.zelpstore.id',
    port: 2022,
    username: 'ronnlbtrn_11484.dfbf800f',
    password: 'Shbng2007',
    remotePath: '/',
    localPath: './',
    ignore: [
        '.git',
        '.vscode',
        'node_modules',
        'storage/sessions', // Biar session lokal ga nimpa server
        'storage/database',
        '.env'
    ]
}).then(() => {
    console.log('🚀 [Deploy] Semua file berhasil disinkronisasi ke Pterodactyl!')
}).catch(err => {
    console.error('❌ [Deploy] Gagal:', err)
})