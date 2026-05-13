import { NextRequest, NextResponse } from 'next/server';
import { embed } from '@/lib/embeddings';
import { matchContentItems } from '@/lib/db';
import { chat } from '@/lib/anthropic';
import { SEARCH_SYSTEM_PROMPT } from '@/lib/prompts';
import { SearchSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { query, memberstackUserId } = parsed.data;

  // Log member query for future personalization (not used in MVP logic)
  if (memberstackUserId) {
    console.log(`Search query from member ${memberstackUserId}: ${query}`);
  }

  // Step 1: Embed query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (err) {
    return NextResponse.json({ error: `Embedding failed: ${String(err)}` }, { status: 500 });
  }

  // Step 2: Query Neon for top matches
  const matches = await matchContentItems(queryEmbedding, 0.5, 5);

  // Step 3: Build Claude prompt with matches
  const matchesText =
    matches.length === 0
      ? 'No matches found.'
      : matches
          .map(
            (m, i) =>
              `${i + 1}. Title: "${m.title}"\n   Description: ${m.description}\n   Type: ${m.media_type}\n   Modality: ${m.modality ?? 'N/A'}\n   Similarity: ${m.similarity.toFixed(2)}`,
          )
          .join('\n\n');

  const userMessage = `Member's query: "${query}"\n\nMatching content items:\n${matchesText}`;

  let response: string;
  try {
    response = await chat(userMessage, SEARCH_SYSTEM_PROMPT);
  } catch (err) {
    return NextResponse.json({ error: `Claude failed: ${String(err)}` }, { status: 500 });
  }

  const results = matches.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    mediaType: m.media_type,
    contentPageUrl: m.content_page_url,
    similarity: m.similarity,
  }));

  return NextResponse.json({ response, results });
}
