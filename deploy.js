// deploy.js
import Client from 'ssh2-sftp-client';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const config = {
    host: 'ap2.nzb.zelpstore.id',
    port: 2022,
    username: 'ronnlbtrn_11484.dfbf800f',
    password: 'Shbng2007'
};

// Daftar file/folder yang dilarang ikut ke server
const ignoreList = [
    'node_modules',
    'storage',
    '.env',
    '.git',
    '.vscode',
    'package-lock.json',
    'deploy.js',
    'pull.js'
];

function runGitCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (err) {
        return null;
    }
}

// Fungsi rekursif untuk membaca SEMUA file lokal (dipakai saat Full Sync)
async function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (ignoreList.includes(file)) continue;
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) {
            await getAllFiles(name, fileList);
        } else {
            fileList.push(name);
        }
    }
    return fileList;
}

async function main() {
    // Cek apakah user menambahkan flag --all di terminal
    const isFullSync = process.argv.includes('--all');
    let filesToUpload = [];

    if (isFullSync) {
        console.log('📦 [Deploy] Mode: FULL SYNC (--all) aktif. Memindai seluruh file proyek...');
        filesToUpload = await getAllFiles('.');
    } else {
        console.log('💥 [Git] Mode: DELTA SYNC. Memeriksa status repositori...');
        const status = runGitCommand('git status --porcelain');

        if (!status) {
            console.log('🔄 [Git] Tree clean. Tidak ada perubahan baru. Memeriksa delta commit terakhir...');
        } else {
            const commitMessage = process.argv.find(arg => !arg.startsWith('-') && arg !== 'deploy.js')
                || `deploy: sync auto ${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}`;

            console.log('📦 [Git] Menyetor dan mengunci commit perubahan...');
            runGitCommand('git add .');
            runGitCommand(`git commit -m "${commitMessage}"`);
            console.log(`✅ [Git] Berhasil commit: "${commitMessage}"`);
        }

        console.log('🔍 [Git] Mengurai berkas yang berubah dari commit terbaru...');
        const changedFilesRaw = runGitCommand('git diff-tree -r --no-commit-id --name-only HEAD');

        if (changedFilesRaw) {
            filesToUpload = changedFilesRaw.split('\n').filter(file => {
                if (!file) return false;
                const firstPart = file.split(/[/\\]/)[0];
                return !ignoreList.includes(firstPart) && fs.existsSync(file);
            });
        }
    }

    if (filesToUpload.length === 0) {
        console.log('👍 [Deploy] Tidak ada file yang perlu diunggah. Selesai.');
        return;
    }

    const sftp = new Client();
    try {
        console.log(`\n⏳ Menyambungkan ke PTERODACTYL SFTP (Mengirim ${filesToUpload.length} file)...`);
        await sftp.connect(config);
        console.log('✅ Terhubung! Memulai proses sinkronisasi struktur berkas...');

        for (const localFile of filesToUpload) {
            // Ubah path Windows (\) ke Linux (/)
            const remoteFile = '/' + localFile.replace(/\\/g, '/');
            const remoteDir = path.dirname(remoteFile).replace(/\\/g, '/');

            // Otomatis bikin folder di server jika belum ada
            if (remoteDir !== '/') {
                const exists = await sftp.exists(remoteDir);
                if (!exists) {
                    await sftp.mkdir(remoteDir, true);
                }
            }

            console.log(`🚀 [Pushing] ${localFile} -> ${remoteFile}`);
            await sftp.put(localFile, remoteFile);
        }

        console.log('\n🎉 [Deploy] Hore! Semua file sukses disinkronisasikan seutuhnya.');
    } catch (err) {
        console.error('\n❌ [Deploy] Proses gagal:', err.message);
    } finally {
        await sftp.end();
    }
}

main();