// src/commands/utility/stalk.js
// !stalk [username] — Cek profil publik GitHub

export default {
    name: 'stalk',
    aliases: ['github', 'ghprofile'],
    category: 'utility',
    description: 'Cek profil publik GitHub seseorang',
    usage: '!stalk [username]',
    example: '!stalk torvalds',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sock, from, msg } = ctx
        if (!args.length) return reply('*Usage:* !stalk [GitHub username]\n\nContoh:\n!stalk torvalds\n!stalk ronnanakibu')

        const username = args[0].replace('@', '')
        await react('🔍')

        try {
            const [userRes, repoRes] = await Promise.all([
                fetch(`https://api.github.com/users/${username}`, {
                    headers: { 'User-Agent': 'WA-Bot/2.0' }
                }),
                fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=3`, {
                    headers: { 'User-Agent': 'WA-Bot/2.0' }
                })
            ])

            if (userRes.status === 404) return reply(`❌ User *${username}* tidak ditemukan di GitHub.`)
            if (!userRes.ok) throw new Error(`GitHub API error: ${userRes.status}`)

            const user = await userRes.json()
            const repos = await repoRes.json()

            let text = `👤 *GitHub Profile: ${user.login}*\n\n`
            if (user.name) text += `📛 Nama: ${user.name}\n`
            if (user.bio) text += `📝 Bio: ${user.bio}\n`
            if (user.location) text += `📍 Lokasi: ${user.location}\n`
            if (user.company) text += `🏢 Company: ${user.company}\n`
            text += `\n`
            text += `📦 Repos: ${user.public_repos}\n`
            text += `⭐ Gists: ${user.public_gists}\n`
            text += `👥 Followers: ${user.followers?.toLocaleString()} | Following: ${user.following?.toLocaleString()}\n`
            text += `📅 Bergabung: ${new Date(user.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}\n`
            text += `🔗 ${user.html_url}\n`

            if (Array.isArray(repos) && repos.length) {
                text += `\n🗂️ *Repo Terbaru:*\n`
                repos.slice(0, 3).forEach(r => {
                    text += `  • *${r.name}*`
                    if (r.description) text += ` — ${r.description.slice(0, 50)}`
                    text += ` ⭐${r.stargazers_count}\n`
                })
            }

            // Kirim dengan avatar
            if (user.avatar_url) {
                await sock.sendMessage(from, {
                    image: { url: user.avatar_url },
                    caption: text
                }, { quoted: msg })
            } else {
                await reply(text)
            }

            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal ambil profil: ${err.message}`)
        }
    }
}