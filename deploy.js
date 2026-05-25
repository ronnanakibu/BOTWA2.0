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

// Folder/file yang tetap dilarang keras ikut ke server
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


function runGitCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (err) {
        return null;
    }
}

async function main() {
    console.log('💥 [Git] Checking repository status...');

    // 1. Cek apakah ada perubahan yang belum di-commit
    const status = runGitCommand('git status --porcelain');

    if (!status) {
        console.log('🔄 [Git] Tree clean. No new changes detected. Exiting...');
        return;
    }

    // 2. Ambil argumen pesan commit dari terminal jika ada (misal: npm run push -- "feat: stiker")
    const commitMessage = process.argv[2] || `deploy: sync auto ${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}`;

    console.log('📦 [Git] Staging and committing changes...');
    runGitCommand('git add .');
    runGitCommand(`git commit -m "${commitMessage}"`);
    console.log(`✅ [Git] Committed with message: "${commitMessage}"`);

    // 3. Minta Git mendaftar file apa saja yang berubah di commit terakhir ini
    console.log('🔍 [Git] Extracting changed files from the last commit...');
    const changedFilesRaw = runGitCommand('git diff-tree -r --no-commit-id --name-only HEAD');

    if (!changedFilesRaw) {
        console.log('⚠️ [Git] Failed to retrieve changed files list.');
        return;
    }

    // Filter file agar tidak membawa file yang masuk daftar ignore
    const filesToUpload = changedFilesRaw.split('\n').filter(file => {
        if (!file) return false;
        const firstPart = file.split(/[/\\]/)[0];
        return !ignoreList.includes(firstPart) && fs.existsSync(file);
    });

    if (filesToUpload.length === 0) {
        console.log('👍 [Deploy] All changed files are in the ignore list. Nothing to upload!');
        return;
    }

    // 4. Mulai proses upload SFTP untuk file pilihan saja
    const sftp = new Client();
    try {
        console.log('\n⏳ Connecting to Pterodactyl SFTP...');
        await sftp.connect(config);
        console.log('✅ Connected! Preparing delta deployment...');

        for (const localFile of filesToUpload) {
            // Konversi path agar ramah dengan OS Linux di server Pterodactyl
            const remoteFile = '/' + localFile.replace(/\\/g, '/');
            const remoteDir = path.dirname(remoteFile).replace(/\\/g, '/');

            // Buat folder di server jika folder tujuan file tersebut belum ada
            if (remoteDir !== '/') {
                const exists = await sftp.exists(remoteDir);
                if (!exists) {
                    await sftp.mkdir(remoteDir, true);
                }
            }

            console.log(`🚀 [Delta Push] ${localFile} -> ${remoteFile}`);
            await sftp.put(localFile, remoteFile);
        }

        console.log('\n🎉 [Deploy] Delta sync success! Only changed files were pushed.');
    } catch (err) {
        console.error('\n❌ [Deploy] Failed:', err.message);
    } finally {
        await sftp.end();
    }
}

main();