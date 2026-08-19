import { NextRequest, NextResponse } from 'next/server';
import { embed } from '@/lib/embeddings';
import { matchContentItems, matchContentItemsForMember, getCohortIdsForMember } from '@/lib/db';
import { verifyMemberToken } from '@/lib/memberstack';
import { chat } from '@/lib/anthropic';
import { SEARCH_SYSTEM_PROMPT, SEARCH_NO_MATCH_RESPONSE } from '@/lib/prompts';
import { SearchSchema } from '@/lib/schemas';
import { checkRate, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Similarity floor for a match to stand on its own. Above this the results speak for
 * themselves and we skip Claude entirely; below it we return the fallback and NO cards.
 *
 * This used to live only as prose inside SEARCH_SYSTEM_PROMPT, which meant paying Claude to
 * evaluate a threshold the code had already computed — and worse, the route returned every
 * 0.4+ match regardless, so a 0.45 match rendered "no perfect fit" copy ABOVE visible cards.
 * The threshold belongs here, in one place.
 */
const STRONG_MATCH = 0.5;

/** Neon-side floor: anything below this never comes back at all (db/schema.sql). */
const MATCH_FLOOR = 0.4;

// This route is public by design (the search box is open to non-members) and each call
// spends Voyage + Anthropic credits, so it needs a budget. Generous for a person typing
// queries; fatal to a script. See lib/rate-limit.ts for the per-process caveat.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  // Throttle BEFORE any paid work (embedding, Claude) so a throttled request costs nothing.
  const ip = getClientIp(req);
  const rate = checkRate(`search:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many searches. Please wait a moment.', retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

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
    matches = await matchContentItemsForMember(queryEmbedding, MATCH_FLOOR, 5, cohortIds);
  } else {
    matches = await matchContentItems(queryEmbedding, MATCH_FLOOR, 5);
  }

  // Step 3: Decide in code, not in the prompt. Only matches at or above STRONG_MATCH are
  // worth showing; a weak match is treated as no match, so the member never sees the
  // "no perfect fit" copy sitting on top of result cards.
  const strong = matches.filter((m) => m.similarity >= STRONG_MATCH);

  if (strong.length === 0) {
    // No Claude call: there is nothing to summarise, and the fallback copy is fixed.
    return NextResponse.json({ response: SEARCH_NO_MATCH_RESPONSE, results: [] });
  }

  // Everything the widget needs to play an item and describe it, in the search response
  // itself. All of these are already selected by both retrieval paths and sit unused on
  // MatchResult, so this costs no extra query and no second round-trip — the member taps
  // a result and it plays, with nothing further to fetch.
  //
  // publicUrl is the stable R2 URL, deliberately not a presigned one. Members play these
  // for sleep, so a track has to survive being started at 11pm and seeked at 3am; a
  // 1-hour signature would 403 on the next range request with no recovery path in the
  // audio element. Entitlement is enforced upstream instead, and strictly: an anonymous
  // caller goes through match_content_items, whose SQL hard-filters cohort and client
  // rows out, and a verified member only ever matches their own cohorts. So this cannot
  // hand anyone a URL for content they weren't already entitled to see.
  //
  // contentPageUrl is dropped: it was the per-item Webflow CMS page, null for every row,
  // and the detail panel replaces the page it pointed at.
  const results = strong.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    mediaType: m.media_type,
    publicUrl: m.public_url,
    durationSeconds: m.duration_seconds,
    useCases: m.use_cases,
    moodTags: m.mood_tags,
    modality: m.modality,
    similarity: m.similarity,
  }));

  // Step 4: Summarise the strong matches. Best-effort — the cards are the substance, so a
  // Claude failure degrades to results-without-prose rather than failing the whole search.
  const matchesText = strong
    .map(
      (m, i) =>
        `${i + 1}. Title: "${m.title}"\n   Description: ${m.description}\n   Type: ${m.media_type}\n   Modality: ${m.modality ?? 'N/A'}\n   Similarity: ${m.similarity.toFixed(2)}`,
    )
    .join('\n\n');

  const userMessage = `Member's query: "${query}"\n\nMatching content items:\n${matchesText}`;

  // Deliberately degrades rather than fails: the cards are the substance, so a Claude outage
  // should cost the prose blurb, not the whole search. The tradeoff is that a persistently
  // broken key degrades quietly, so the failure is flagged in the payload (`summaryFailed`)
  // as well as logged — the widget ignores it, but it makes the state visible when debugging
  // "why did the summary disappear" without having to read server logs.
  let response: string | null = null;
  let summaryFailed = false;
  try {
    response = await chat(userMessage, SEARCH_SYSTEM_PROMPT);
  } catch (err) {
    summaryFailed = true;
    console.error('[search] Claude summary failed, returning results only:', err);
  }

  return NextResponse.json({ response, results, ...(summaryFailed && { summaryFailed: true }) });
}
