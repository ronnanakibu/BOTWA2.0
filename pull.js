// pull.js
import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';

const config = {
    host: 'ap2.nzb.zelpstore.id',
    port: 2022,
    username: 'ronnlbtrn_11484.dfbf800f',
    password: 'Shbng2007'
};

// Folder/file yang TIDAK BOLEH disentuh (Biar ga tumpang tindih)
const ignoreList = [
    '.git',
    '.vscode',
    'node_modules',
    'storage',        // Proteksi mutlak session server
    '.env',
    'deploy.js',
    'pull.js',
    'package-lock.json',
    '.yarn',
    '.npm',
    'cache',
    '.trash'
];

async function downloadRemoteDir(sftp, remoteDir, localDir) {
    const list = await sftp.list(remoteDir);

    for (const item of list) {
        if (ignoreList.includes(item.name)) continue;

        const remotePath = remoteDir === '/' ? `/${item.name}` : `${remoteDir}/${item.name}`;
        const localPath = path.join(localDir, item.name);

        if (item.type === 'd') {
            if (!fs.existsSync(localPath)) {
                fs.mkdirSync(localPath, { recursive: true });
            }
            await downloadRemoteDir(sftp, remotePath, localPath);
        } else {
            let shouldDownload = false;
            let reason = '';

            // Pengecekan 1: Apakah file belum ada di lokal?
            if (!fs.existsSync(localPath)) {
                shouldDownload = true;
                reason = 'New File';
            } else {
                const localStat = fs.statSync(localPath);

                // Pembulatan ke detik karena presisi filesystem SFTP kadang berbeda dengan OS lokal
                const remoteMtimeSec = Math.floor(item.modifyTime / 1000);
                const localMtimeSec = Math.floor(localStat.mtimeMs / 1000);

                // Pengecekan 2: Apakah ukurannya berubah?
                if (item.size !== localStat.size) {
                    shouldDownload = true;
                    reason = `Size Changed (${localStat.size}B -> ${item.size}B)`;
                }
                // Pengecekan 3: Apakah file di remote lebih baru (habis diedit di panel)?
                else if (remoteMtimeSec > localMtimeSec) {
                    shouldDownload = true;
                    reason = 'Remote Updated';
                }
            }

            if (shouldDownload) {
                console.log(`📥 [Smart Pull] Downloading (${reason}): ${remotePath} -> ${localPath}`);
                await sftp.fastGet(remotePath, localPath);
            } else {
                // File identik, skip biar cepet!
                // console.log(` Skipped: ${item.name} is up-to-date.`);
            }
        }
    }
}

async function main() {
    const sftp = new Client();
    try {
        console.log('⏳ Connecting to Pterodactyl SFTP for smart pulling...');
        await sftp.connect(config);
        console.log('✅ Connected! Scanning and syncing changes from server...');

        await downloadRemoteDir(sftp, '/', '.');

        console.log('\n🎉 [Pull] Smart sync selesai! Semua perubahan di remote berhasil ditarik.');
    } catch (err) {
        console.error('\n❌ [Pull] Gagal:', err.message);
    } finally {
        await sftp.end();
    }
}

main();