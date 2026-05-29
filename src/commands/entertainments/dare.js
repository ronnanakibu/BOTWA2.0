// src/commands/entertainment/dare.js
// !dare — Random dare challenge untuk game Truth or Dare

const DARES = [
    'Kirim selfie dengan ekspresi paling aneh ke grup sekarang!',
    'Hubungi kontak pertama di HP kamu dan bilang "aku kangen kamu".',
    'Ubah bio medsos kamu jadi "I love my fans" selama 10 menit.',
    'Kirim voice note nyanyi minimal 15 detik ke grup.',
    'Tag 3 orang random di kontakmu dan bilang "kamu orang terpenting di hidupku".',
    'Balas pesan terakhir dari salah satu kontak dengan emoji 💃 tanpa konteks.',
    'Ceritakan lelucon paling garing yang kamu tahu sekarang.',
    'Kirim pesan ke grup utama keluarga: "Doain aku ya, lagi perjuangan".',
    'Lakukan 10 push-up dan kirim video buktinya ke grup.',
    'Tulis nama crush kamu di kertas, foto, dan kirim ke grup. (Bisa dihapus sendiri!)',
    'Minta maaf ke orang terakhir yang kamu sakiti via chat.',
    'Kirim stiker paling cringe yang ada di koleksimu.',
    'Ubah nama display WhatsApp kamu jadi nama panggilan paling memalukan selama 15 menit.',
    'Nyanyi lagu kebangsaan Indonesia versi opera via voice note.',
    'Ceritakan mimpi paling aneh yang pernah kamu alami.',
    'Kirim GIF tari-tarian ke grup.',
    'Buat caption foto profil kamu yang baru sekarang dan kirim idenya ke grup.',
    'Lakukan gerakan dance TikTok terpopuler sekarang, kirim videonya.',
    'Kirim pesan ke gebetan/crush dengan kata-kata "Hei, kamu tau ga, langit itu biru".',
    'Berdiri dan jalan jinjit selama 1 menit penuh.',
]

export default {
    name: 'dare',
    aliases: ['dares', 'tohdare', 'tantang'],
    category: 'entertainment',
    description: 'Random dare challenge untuk game Truth or Dare',
    usage: '!dare',
    cooldown: 3,
    permissions: ['user'],

    async execute(ctx) {
        const { reply, react } = ctx
        const challenge = DARES[Math.floor(Math.random() * DARES.length)]
        await react('😈')
        await reply(`🎲 *DARE*\n\n_${challenge}_\n\n_Berani ga? 😏_`)
    }
}