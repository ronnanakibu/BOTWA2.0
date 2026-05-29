// src/commands/general/changelogs.js

export default {
    name: 'changelogs',
    aliases: ['changelog', 'update', 'releases'],
    category: 'general',
    description: 'Melihat update/changelog terbaru langsung dari GitHub',
    usage: '!changelogs',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { reply } = ctx;

        // Sesuaikan dengan username dan nama repo GitHub lu
        const owner = 'ronnanakibu';
        const repo = 'botwa2.0';

        try {
            await reply('⏳ Mengambil data rilis terbaru dari GitHub...');

            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);

            if (!response.ok) {
                if (response.status === 404) {
                    return reply('Belum ada rilis/changelog resmi yang dipublish di repositori GitHub.');
                }
                throw new Error(`GitHub API Error: ${response.statusText}`);
            }

            const data = await response.json();

            // Format tanggal jadi lokalisasi Indonesia
            const releaseDate = new Date(data.published_at).toLocaleDateString('id-ID', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            // Header WA
            let text = `*📦 RILIS TERBARU: ${data.name || data.tag_name}*\n`;
            text += `*🏷️ Versi:* ${data.tag_name}\n`;
            text += `*📅 Dirilis:* ${releaseDate}\n\n`;
            text += `*📝 Catatan Rilis:*\n\n`;

            // Konversi tipis-tipis dari Markdown GitHub ke format WhatsApp
            // (Mengubah **bold** jadi *bold* ala WA, dan menghilangkan header #)
            let bodyText = data.body
                .replace(/^### (.*$)/gim, '*$1*') // H3 ke WA Bold
                .replace(/^## (.*$)/gim, '*$1*')  // H2 ke WA Bold
                .replace(/^# (.*$)/gim, '*$1*')   // H1 ke WA Bold
                .replace(/\*\*(.*?)\*\*/g, '*$1*'); // **text** ke *text*

            text += `${bodyText}\n\n`;
            text += `🔗 *Detail:* ${data.html_url}`;

            await reply(text.trim());
        } catch (error) {
            console.error('[Error Changelogs]', error);
            reply('❌ Gagal mengambil data changelog dari GitHub. Coba lagi nanti.');
        }
    }
}