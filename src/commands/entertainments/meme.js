// src/commands/entertainment/meme.js
// !meme — Random meme dari Reddit

export default {
    name: 'meme',
    aliases: ['randomeme', 'memes'],
    category: 'entertainment',
    description: 'Random meme dari Reddit',
    usage: '!meme [subreddit]',
    example: '!meme programmerhumor',
    cooldown: 5,
    permissions: ['user'],

    async execute(ctx) {
        const { args, reply, react, sock, from, msg } = ctx

        const subreddits = ['memes', 'dankmemes', 'me_irl', 'ProgrammerHumor', 'indonesia']
        const sub = args[0] ?? subreddits[Math.floor(Math.random() * subreddits.length)]

        await react('⏳')

        try {
            const res = await fetch(
                `https://www.reddit.com/r/${sub}/random.json?limit=1`,
                { headers: { 'User-Agent': 'WA-Bot/2.0' } }
            )

            if (!res.ok) throw new Error(`Subreddit r/${sub} tidak ditemukan atau private.`)
            const data = await res.json()

            // Reddit random returns array of listings
            const post = Array.isArray(data)
                ? data[0]?.data?.children?.[0]?.data
                : data?.data?.children?.[0]?.data

            if (!post) throw new Error('Tidak ada post ditemukan.')

            // Filter: hanya gambar
            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
            const isImage = imageExts.some(ext => post.url?.toLowerCase().endsWith(ext))
                || post.url?.includes('i.redd.it')
                || post.url?.includes('i.imgur.com')

            if (!isImage) {
                // Coba lagi — ambil top posts dan pilih yang ada gambarnya
                const topRes = await fetch(
                    `https://www.reddit.com/r/${sub}/hot.json?limit=20`,
                    { headers: { 'User-Agent': 'WA-Bot/2.0' } }
                )
                const topData = await topRes.json()
                const posts = topData?.data?.children?.map(c => c.data) ?? []
                const imagePosts = posts.filter(p =>
                    imageExts.some(ext => p.url?.toLowerCase().endsWith(ext)) ||
                    p.url?.includes('i.redd.it') ||
                    p.url?.includes('i.imgur.com')
                )
                if (!imagePosts.length) throw new Error('Tidak ada meme gambar ditemukan di r/' + sub)
                const picked = imagePosts[Math.floor(Math.random() * Math.min(imagePosts.length, 10))]
                await sock.sendMessage(from, {
                    image: { url: picked.url },
                    caption: `😂 *${picked.title}*\n\nr/${sub} • ⬆️ ${picked.ups?.toLocaleString()}`
                }, { quoted: msg })
            } else {
                await sock.sendMessage(from, {
                    image: { url: post.url },
                    caption: `😂 *${post.title}*\n\nr/${sub} • ⬆️ ${post.ups?.toLocaleString()}`
                }, { quoted: msg })
            }

            await react('✅')
        } catch (err) {
            await react('❌')
            await reply(`❌ Gagal ambil meme: ${err.message}`)
        }
    }
}