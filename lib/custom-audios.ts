import { getSql } from './db';

/**
 * Custom audios: a recording Lindsay makes for one buyer and delivers to their portal
 * (CC-13, CC-14). There is no purchase webhook — GHL tells Lindsay, and she starts the
 * delivery from the dashboard — so a row is born `in_progress` when she begins one.
 *
 * Its own table rather than another `kind` on content_items: it has a lifecycle (in
 * progress → delivered) and belongs to the person, not to an enrollment — a buyer usually
 * has no coaching program at all.
 */

export interface CustomAudio {
  id: string;
  client_id: string;
  title: string;
  description: string;
  r2_key: string | null;
  media_type: 'audio' | 'video';
  status: 'in_progress' | 'delivered';
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listCustomAudios(clientId: string): Promise<CustomAudio[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM custom_audios WHERE client_id = ${clientId} ORDER BY created_at DESC`;
  return rows as CustomAudio[];
}

/** What the portal shows: delivered only, newest first. Scoped by client — never by URL. */
export async function listDeliveredCustomAudios(clientId: string): Promise<CustomAudio[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM custom_audios
    WHERE client_id = ${clientId} AND status = 'delivered' AND r2_key IS NOT NULL
    ORDER BY delivered_at DESC`;
  return rows as CustomAudio[];
}

export async function getCustomAudio(id: string): Promise<CustomAudio | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM custom_audios WHERE id = ${id}`;
  return (rows[0] as CustomAudio) ?? null;
}

export async function createCustomAudio(
  clientId: string,
  data: { title: string; description: string },
): Promise<CustomAudio> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO custom_audios (client_id, title, description)
    VALUES (${clientId}, ${data.title}, ${data.description})
    RETURNING *`;
  return rows[0] as CustomAudio;
}

/**
 * Patch a custom audio. Marking it delivered stamps `delivered_at` (first delivery only, so
 * a later title fix doesn't reorder the portal); moving it back to in progress clears it.
 * Returns the row as it was before, so the caller can clean up a replaced R2 object.
 */
export async function updateCustomAudio(
  id: string,
  patch: {
    title?: string;
    description?: string;
    r2Key?: string;
    mediaType?: 'audio' | 'video';
    status?: 'in_progress' | 'delivered';
  },
): Promise<{ before: CustomAudio; after: CustomAudio } | null> {
  const before = await getCustomAudio(id);
  if (!before) return null;
  const status = patch.status ?? before.status;
  if (status === 'delivered' && !(patch.r2Key ?? before.r2_key)) {
    throw new Error('Upload the audio before marking it delivered');
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE custom_audios
    SET title        = ${patch.title ?? before.title},
        description  = ${patch.description ?? before.description},
        r2_key       = ${patch.r2Key ?? before.r2_key},
        media_type   = ${patch.mediaType ?? before.media_type},
        status       = ${status},
        delivered_at = CASE
                         WHEN ${status} = 'delivered' THEN COALESCE(delivered_at, now())
                         ELSE NULL
                       END,
        updated_at   = now()
    WHERE id = ${id}
    RETURNING *`;
  return { before, after: rows[0] as CustomAudio };
}

export async function deleteCustomAudio(id: string): Promise<CustomAudio | null> {
  const sql = getSql();
  const rows = await sql`DELETE FROM custom_audios WHERE id = ${id} RETURNING *`;
  return (rows[0] as CustomAudio) ?? null;
}

/** For /attention: deliveries Lindsay has started but not finished. */
export async function listOpenCustomAudios(): Promise<(CustomAudio & { client_name: string })[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT a.*, c.name AS client_name
    FROM custom_audios a JOIN clients c ON c.id = a.client_id
    WHERE a.status = 'in_progress'
    ORDER BY a.created_at DESC`;
  return rows as (CustomAudio & { client_name: string })[];
}
