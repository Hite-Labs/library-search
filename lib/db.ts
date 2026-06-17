import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { env } from './env';

let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(env.NEON_DATABASE_URL);
  return _sql;
}

export interface ContentItem {
  id: string;
  webflow_item_id: string | null;
  title: string;
  description: string;
  media_type: 'audio' | 'video' | 'pdf';
  use_cases: string;
  modality: string | null;
  mood_tags: string;
  duration_seconds: number | null;
  r2_key: string;
  public_url: string;
  content_page_url: string | null;
  transcript: string | null;
  program_id: string | null;
  sequence_order: number | null;
  created_at: string;
}

export interface MatchResult {
  id: string;
  webflow_item_id: string | null;
  title: string;
  description: string;
  media_type: string;
  use_cases: string;
  modality: string | null;
  mood_tags: string;
  duration_seconds: number | null;
  public_url: string;
  content_page_url: string | null;
  similarity: number;
}

export async function insertContentItem(data: {
  title: string;
  description: string;
  mediaType: 'audio' | 'video' | 'pdf';
  useCases: string;
  modality: string;
  moodTags: string;
  durationSeconds: number | null;
  r2Key: string;
  publicUrl: string;
  transcript: string | null;
  embedding: number[];
}): Promise<string> {
  const sql = getSql();
  const embeddingStr = `[${data.embedding.join(',')}]`;
  const rows = await sql`
    INSERT INTO content_items
      (title, description, media_type, use_cases, mood_tags, modality,
       duration_seconds, r2_key, public_url, transcript, embedding)
    VALUES
      (${data.title}, ${data.description}, ${data.mediaType}, ${data.useCases},
       ${data.moodTags}, ${data.modality}, ${data.durationSeconds},
       ${data.r2Key}, ${data.publicUrl}, ${data.transcript}, ${embeddingStr}::vector)
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function updateWebflowItemId(neonId: string, webflowItemId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE content_items SET webflow_item_id = ${webflowItemId} WHERE id = ${neonId}
  `;
}

export async function updateContentPageUrl(neonId: string, contentPageUrl: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE content_items SET content_page_url = ${contentPageUrl} WHERE id = ${neonId}
  `;
}

export async function matchContentItems(
  embedding: number[],
  matchThreshold: number,
  matchCount: number,
): Promise<MatchResult[]> {
  const sql = getSql();
  const embeddingStr = `[${embedding.join(',')}]`;
  const rows = await sql`
    SELECT * FROM match_content_items(
      ${embeddingStr}::vector,
      ${matchThreshold},
      ${matchCount}
    )
  `;
  return rows as MatchResult[];
}
