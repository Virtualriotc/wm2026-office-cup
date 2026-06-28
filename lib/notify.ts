// Optional Telegram alarm channel for the daily integrity check. No-op unless
// BOTH env vars are set, so the app runs identically without it — set
// TELEGRAM_BOT_TOKEN + TELEGRAM_ALARM_CHAT_ID in Vercel to turn on alerts.
// Never throws: a notification failure must never break the cron.
export async function notifyTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ALARM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
