import { NextRequest, NextResponse } from 'next/server';
import { createSuggestion, listSuggestions } from '@/lib/db';
import { SuggestionCreateSchema } from '@/lib/schemas';
import { verifyMemberToken } from '@/lib/memberstack';
import { checkRate, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/suggestions — a member (or an anonymous searcher) tells us what is missing.
 *
 * PUBLIC, deliberately and carefully. The search box is open to non-members, so the most
 * valuable suggestions come from people with no account: someone searching for something
 * we do not have, before they have bought anything, is describing what would make them buy.
 * Requiring a login here would filter out exactly that group.
 *
 * Public also means this is the one write endpoint on the app that anyone can reach, so:
 *   - it is rate limited per IP, tighter than search since nobody submits five ideas a
 *     minute, and unlike search there is no cost ceiling from the vendor side to hide behind
 *   - every field is length-capped in the schema (lib/schemas.ts)
 *   - it writes to a table nothing else reads at runtime, so a flood degrades a dashboard
 *     queue rather than anything a member sees
 *
 * NOT run through proxy.ts. That gates on the dashboard's session cookie, which a member
 * will never have — /api/suggestions must stay off that matcher.
 */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rate = checkRate(`suggest-box:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Thanks — that is a few in quick succession. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SuggestionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Something has to be in it. An empty submission is a mis-click, and letting them
  // through would fill the queue with rows carrying no information at all.
  const { query, body: text, email } = parsed.data;
  if (!query.trim() && !text.trim()) {
    return NextResponse.json({ error: 'Tell us what you are looking for.' }, { status: 400 });
  }

  // The member id comes from the verified token, never from the request body — otherwise
  // anyone could attribute a suggestion to anyone. Absent or unverifiable is fine: it just
  // means we do not know who this is, which is the normal case for a public search.
  const auth = req.headers.get('authorization');
  const token = auth?.replace(/^Bearer\s+/i, '').trim();
  const verified = token ? await verifyMemberToken(token) : null;

  const suggestion = await createSuggestion({
    source: parsed.data.source,
    query: query.trim(),
    body: text.trim(),
    email: email.trim(),
    memberstackId: verified?.id ?? null,
  });

  // Only the id goes back. The row holds an email and is operator-facing; echoing it would
  // turn a write endpoint into a read one.
  return NextResponse.json({ ok: true, id: suggestion.id });
}

// GET /api/suggestions — the dashboard queue. Cookie-gated by proxy.ts.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const suggestions = await listSuggestions(status);
  return NextResponse.json({ suggestions });
}
