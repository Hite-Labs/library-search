import { env } from './env';
import { sendMessage } from './telegram';

/**
 * Ping Lindsay on Telegram (CC-7): one short plain-text line plus a dashboard link straight
 * to the thing that needs her.
 *
 * Never throws. A notification is a courtesy on top of state that is already recorded — the
 * step status on /attention is the source of truth — so a Telegram outage must never turn a
 * successful setup step into a failed one. Unconfigured or failed sends are logged instead.
 */
export async function notifyLindsay(text: string, path = '/attention'): Promise<void> {
  const chatId = env.TELEGRAM_LINDSAY_CHAT_ID;
  const base = (env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const message = base ? `${text}\n\n${base}${path}` : text;

  if (!chatId || !env.TELEGRAM_BOT_TOKEN) {
    console.warn('[notify] Telegram not configured; would have sent:', message);
    return;
  }
  try {
    await sendMessage(chatId, message);
  } catch (err) {
    console.error('[notify] failed to message Lindsay:', err);
  }
}
