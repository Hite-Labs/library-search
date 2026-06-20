import { NextRequest, NextResponse } from 'next/server';
import { embed } from '@/lib/embeddings';
import { matchContentItems, matchContentItemsForMember, getCohortIdsForMember } from '@/lib/db';
import { verifyMemberToken } from '@/lib/memberstack';
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

  const { query } = parsed.data;

  // Resolve a TRUSTED member id from a verified Memberstack JWT (the _ms-mid token the
  // widget forwards in the Authorization header). We no longer trust the raw
  // memberstackUserId from the body for access decisions. A missing/invalid token →
  // anonymous, which simply means library-only results (the search box is public).
  // SECURITY: any future portal route returning a member's private data must likewise
  // verify the token (verifyMemberToken) and match the id to the requested record.
  let memberId: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const verified = await verifyMemberToken(token);
    if (verified) memberId = verified.id;
  }

  // Step 1: Embed query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (err) {
    return NextResponse.json({ error: `Embedding failed: ${String(err)}` }, { status: 500 });
  }

  // Step 2: Query Neon for top matches. A verified member also sees their cohort's
  // content; anonymous (or unverified) callers get the public library only.
  let matches;
  if (memberId) {
    const cohortIds = await getCohortIdsForMember(memberId);
    matches = await matchContentItemsForMember(queryEmbedding, 0.4, 5, cohortIds);
  } else {
    matches = await matchContentItems(queryEmbedding, 0.4, 5);
  }

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
