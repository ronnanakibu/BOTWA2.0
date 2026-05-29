// src/commands/entertainment/truth.js
// !truth — Random truth question untuk game Truth or Dare

const TRUTHS = [
    'Apa hal paling memalukan yang pernah kamu lakukan di depan umum?',
    'Siapa orang yang paling sering kamu stalk di medsos?',
    'Apa kebohongan terbesar yang pernah kamu bilang ke orang tua?',
    'Pernahkah kamu punya perasaan ke seseorang di grup ini?',
    'Apa hal yang paling kamu sesali dalam hidup?',
    'Siapa yang pertama kali kamu hubungi kalau ada masalah besar?',
    'Apa kebiasaan buruk yang kamu sembunyikan dari orang lain?',
    'Pernahkah kamu menangis karena film/lagu? Film/lagu apa?',
    'Apa hal yang paling kamu takuti tapi malu untuk diakui?',
    'Kalau bisa hapus satu kenangan, kenangan apa yang kamu pilih?',
    'Apa hal tergila yang pernah kamu lakuin karena peer pressure?',
    'Berapa lama rekor kamu tidak mandi?',
    'Siapa yang kamu blokir di medsos dan kenapa?',
    'Apa password yang paling sering kamu pakai? (tanpa bilang yang sebenarnya)',
    'Apa aplikasi yang paling sering kamu sembunyikan dari orang tua?',
    'Pernahkah kamu baca chat orang lain tanpa izin?',
    'Apa hal yang paling ingin kamu ubah dari diri sendiri?',
    'Kapan terakhir kali kamu berbohong, dan apa bohongnya?',
    'Siapa orang di grup ini yang paling kamu percaya?',
    'Apa momen paling canggung yang pernah kamu alami?',
]

export default {
    name: 'truth',
    aliases: ['truths', 'tohtruth', 'jujur'],
    category: 'entertainment',
    description: 'Random truth question untuk game Truth or Dare',
    usage: '!truth',
    cooldown: 3,
    permissions: ['user'],

    async execute(ctx) {
        const { reply, react } = ctx
        const question = TRUTHS[Math.floor(Math.random() * TRUTHS.length)]
        await react('🤔')
        await reply(`🎯 *TRUTH*\n\n_${question}_\n\n_Jawab dengan jujur! 👀_`)
    }
}