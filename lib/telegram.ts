import { env } from './env';

/**
 * Minimal Telegram Bot API client — plain fetch, no SDK. Used for two things: handing each
 * new coaching client a private group from the pool (CC-5), and pinging Lindsay (CC-7).
 *
 * The bot only ever calls out; nothing here needs a webhook.
 */

export class TelegramError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Seconds Telegram asked us to wait (429 flood control). */
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'TelegramError';
  }
}

export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN is not set', 0);

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    description?: string;
    parameters?: { retry_after?: number };
  } | null;

  if (!body?.ok) {
    throw new TelegramError(
      `Telegram ${method}: ${body?.description ?? `HTTP ${res.status}`}`,
      res.status,
      body?.parameters?.retry_after,
    );
  }
  return body.result as T;
}

export async function sendMessage(chatId: string | number, text: string): Promise<void> {
  await call('sendMessage', {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
  });
}

export async function setChatTitle(chatId: string | number, title: string): Promise<void> {
  // Telegram caps titles at 128 characters.
  await call('setChatTitle', { chat_id: chatId, title: title.slice(0, 128) });
}

/**
 * A named invite link that admits exactly one person, so a forwarded intro email can't let a
 * second person into a client's private space.
 */
export async function createChatInviteLink(
  chatId: string | number,
  name: string,
): Promise<string> {
  const link = await call<{ invite_link: string }>('createChatInviteLink', {
    chat_id: chatId,
    // Telegram caps link names at 32 characters.
    name: name.slice(0, 32),
    member_limit: 1,
  });
  return link.invite_link;
}

export async function getMe(): Promise<{ id: number; username?: string }> {
  return call('getMe', {});
}

export async function getChat(chatId: string | number): Promise<{ id: number; title?: string; type: string }> {
  return call('getChat', { chat_id: chatId });
}

export async function getChatMember(
  chatId: string | number,
  userId: number,
): Promise<{ status: string; can_change_info?: boolean; can_invite_users?: boolean }> {
  return call('getChatMember', { chat_id: chatId, user_id: userId });
}
