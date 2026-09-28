import { getSql } from './db';

/**
 * The pool of pre-made private Telegram groups (CC-5). Lindsay (or Russell) creates groups
 * ahead of time with the bot as an admin and registers them here; intake hands one to each
 * new client. The Bot API can't create groups, which is why there's a pool at all.
 */

export interface TelegramSpace {
  chat_id: string; // bigint comes back from Neon as a string
  status: 'available' | 'assigned';
  client_id: string | null;
  invite_link: string | null;
  created_at: string;
  assigned_at: string | null;
}

/** Below this many spare groups, Lindsay is warned to make more. */
export const LOW_POOL_THRESHOLD = 2;

export async function getSpaceForClient(clientId: string): Promise<TelegramSpace | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM telegram_spaces WHERE client_id = ${clientId}`;
  return (rows[0] as TelegramSpace) ?? null;
}

/**
 * Take one available group for this client, atomically — SKIP LOCKED means two intakes
 * landing together each get a different group, never the same one.
 */
export async function claimSpace(clientId: string): Promise<TelegramSpace | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE telegram_spaces
    SET status = 'assigned', client_id = ${clientId}, assigned_at = now()
    WHERE chat_id = (
      SELECT chat_id FROM telegram_spaces
      WHERE status = 'available'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
  return (rows[0] as TelegramSpace) ?? null;
}

export async function setSpaceInviteLink(chatId: string, link: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE telegram_spaces SET invite_link = ${link} WHERE chat_id = ${chatId}`;
}

export async function countAvailableSpaces(): Promise<number> {
  const sql = getSql();
  const rows = await sql`SELECT count(*)::int AS n FROM telegram_spaces WHERE status = 'available'`;
  return rows[0].n as number;
}

export async function listSpaces(): Promise<(TelegramSpace & { client_name: string | null })[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT t.*, c.name AS client_name
    FROM telegram_spaces t LEFT JOIN clients c ON c.id = t.client_id
    ORDER BY t.status, t.created_at`;
  return rows as (TelegramSpace & { client_name: string | null })[];
}

/** Add a group to the pool. Returns false if it's already registered. */
export async function registerSpace(chatId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO telegram_spaces (chat_id) VALUES (${chatId})
    ON CONFLICT (chat_id) DO NOTHING
    RETURNING chat_id`;
  return rows.length > 0;
}
