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
    // ─────────────────────────────────────────────
    // 🌟 PARSING FLAGS & CONDITIONAL LOGIC
    // ─────────────────────────────────────────────
    const args = process.argv.slice(2);
    const isFullSync = args.includes('--all');
    const hasGitFlag = args.includes('--git');
    const hasSftpFlag = args.includes('--sftp');

    // Default: Jalan dua-duanya (true)
    let runGit = true;
    let runSftp = true;

    // Jika salah satu atau kedua flag target di-spesifikasikan, gunakan seleksi flag
    if (hasGitFlag || hasSftpFlag) {
        runGit = hasGitFlag;
        runSftp = hasSftpFlag;
    }

    // Cari commit message: ambil argumen pertama yang bukan berawalan '-' (bukan flag)
    const commitMessage = args.find(arg => !arg.startsWith('-'))
        || `deploy: sync auto ${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}`;

    console.log(`\n🔥 RonnBot Pipeline Active Target → Git: ${runGit ? '✅' : '❌'} | SFTP: ${runSftp ? '✅' : '❌'}`);

    // ─────────────────────────────────────────────
    // 📦 TARGET 1: GITHUB VERSION CONTROL SYSTEM
    // ─────────────────────────────────────────────
    if (runGit) {
        console.log('\n💥 [Git] Mode: DELTA COMMIT. Memeriksa status repositori...');
        const status = runGitCommand('git status --porcelain');

        if (!status) {
            console.log('🔄 [Git] Tree clean. Tidak ada perubahan baru untuk di-commit lokal.');
        } else {
            console.log('📦 [Git] Menyetor dan mengunci commit perubahan...');
            runGitCommand('git add .');
            runGitCommand(`git commit -m "${commitMessage}"`);
            console.log(`✅ [Git] Berhasil commit lokal: "${commitMessage}"`);
        }

        console.log('📦 [GitHub] Memulai sinkronisasi repository ke GitHub remote...');
        try {
            console.log('🚀 [GitHub] Meluncurkan perintah git push...');
            execSync('git push', { stdio: 'inherit' });
            console.log('✅ [GitHub] Sempurna! Kode terbaru berhasil dicadangkan ke GitHub.');
        } catch (gitErr) {
            console.error('⚠️ [GitHub] Peringatan: Gagal melakukan push ke GitHub. Tetap melanjutkan pipeline...');
        }
    } else {
        console.log('\n⏩ [GitHub] Dilewati (Flag --git tidak dipanggil).');
    }

    // ─────────────────────────────────────────────
    // 🚀 TARGET 2: SFTP PTERODACTYL SERVER DEPLOYMENT
    // ─────────────────────────────────────────────
    if (runSftp) {
        let filesToUpload = [];

        if (isFullSync) {
            console.log('\n📦 [SFTP] Mode: FULL SYNC (--all) aktif. Memindai seluruh file proyek...');
            filesToUpload = await getAllFiles('.');
        } else {
            console.log('\n🔍 [SFTP] Mode: DELTA SYNC. Mengurai berkas yang berubah dari commit terbaru...');
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
            console.log('👍 [SFTP] Tidak ada file baru/delta yang perlu diunggah. Proses selesai.');
            return;
        }

        const sftp = new Client();
        try {
            console.log(`\n⏳ Menyambungkan ke PTERODACTYL SFTP (Mengirim ${filesToUpload.length} file)...`);
            await sftp.connect(config);
            console.log('✅ Terhubung! Memulai proses sinkronisasi struktur berkas...');

            for (const localFile of filesToUpload) {
                const remoteFile = '/' + localFile.replace(/\\/g, '/');
                const remoteDir = path.dirname(remoteFile).replace(/\\/g, '/');

                if (remoteDir !== '/') {
                    const exists = await sftp.exists(remoteDir);
                    if (!exists) {
                        await sftp.mkdir(remoteDir, true);
                    }
                }

                console.log(`🚀 [Pushing] ${localFile} -> ${remoteFile}`);
                await sftp.put(localFile, remoteFile);
            }

            console.log('\n🎉 [SFTP] Hore! Semua file sukses disinkronisasikan seutuhnya ke Pterodactyl.');
        } catch (err) {
            console.error('\n❌ [SFTP] Proses upload gagal:', err.message);
        } finally {
            await sftp.end();
        }
    } else {
        console.log('⏩ [SFTP] Dilewati (Flag --sftp tidak dipanggil).');
    }

    console.log('\n🎉 [DONE] Tugas pipeline selesai dieksekusi, cuy!');
}

main();