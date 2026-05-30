// src/services/alarm.js
// Alarm service untuk reminder — support call + text notification

/**
 * Trigger alarm ke user.
 * @param {object} sock - Baileys socket
 * @param {string} chatId - JID tujuan (DM atau grup)
 * @param {string} message - Pesan reminder
 * @param {boolean} useCall - Kalau true, ring dulu sebelum kirim text
 */
export async function triggerAlarm(sock, chatId, message, useCall = false) {
    const isDM = !chatId.endsWith('@g.us')

    // ── Mode Call (hanya DM) ──
    if (useCall && isDM) {
        try {
            // Baileys: offer call → reject sendiri setelah 3 detik
            // Ini akan bikin HP user berdering sebentar
            const callResult = await sock.offerCall(chatId, 'audio')
            const callId = callResult?.callId ?? callResult?.id

            if (callId) {
                // Reject setelah 3 detik — tujuannya cuma bikin HP bunyi
                setTimeout(async () => {
                    try {
                        await sock.rejectCall(callId, chatId)
                    } catch (_) { }
                }, 3000)
            }
        } catch (callErr) {
            // Call gagal (mungkin fitur tidak tersedia) — fallback ke text
            console.warn('[Alarm] Call gagal, fallback ke text:', callErr.message)
        }
    }

    // ── Kirim notif text ──
    const timeStr = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    })

    const callNote = useCall && isDM ? '\n📞 _Bot sudah nge-ring kamu!_' : ''

    await sock.sendMessage(chatId, {
        text:
            `⏰ *REMINDER!*${callNote}\n\n` +
            `📌 *${message}*\n\n` +
            `🕐 ${timeStr}\n` +
            `_Set reminder baru: !remindme [waktu] [pesan]_`
    })
}   