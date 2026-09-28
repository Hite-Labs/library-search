import { NextResponse } from 'next/server';
import { getChat, getChatMember, getMe, isTelegramConfigured, TelegramError } from '@/lib/telegram';
import { registerSpace } from '@/lib/telegram-spaces';
import { TelegramSpaceRegisterSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

/**
 * POST /api/telegram-spaces — add a pre-made private group to the pool (CC-5).
 *
 * Checked with Telegram before it's accepted: a group the bot can't rename or make invite
 * links for would only fail later, at a new client's intake, which is the worst time.
 */
export async function POST(req: Request) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 503 });
  }
  const parsed = TelegramSpaceRegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid chat id' },
      { status: 400 },
    );
  }
  const { chatId } = parsed.data;

  try {
    const [chat, me] = await Promise.all([getChat(chatId), getMe()]);
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      return NextResponse.json({ error: `That chat is a ${chat.type}, not a group` }, { status: 422 });
    }
    const member = await getChatMember(chatId, me.id);
    const isCreator = member.status === 'creator';
    const canManage = isCreator || (member.status === 'administrator' && member.can_change_info && member.can_invite_users);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Make the bot an admin of that group with "Change group info" and "Invite users" turned on, then try again.' },
        { status: 422 },
      );
    }
    const added = await registerSpace(String(chat.id));
    if (!added) return NextResponse.json({ error: 'That group is already registered' }, { status: 409 });
    return NextResponse.json({ ok: true, chatId: String(chat.id), title: chat.title ?? null }, { status: 201 });
  } catch (err) {
    if (err instanceof TelegramError) {
      return NextResponse.json(
        { error: `${err.message}. Is the bot a member of that group, and is the id right?` },
        { status: 422 },
      );
    }
    throw err;
  }
}
