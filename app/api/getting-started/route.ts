import { NextRequest, NextResponse } from 'next/server';
import { getGettingStarted } from '@/lib/db';
import { checkRate, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * GET /api/getting-started — the curated on-ramp the widget shows before anyone searches.
 *
 * PUBLIC, with no token, and that is a deliberate decision rather than an oversight.
 *
 * The widget cannot use /api/portal for this. embed.js forwards the Memberstack token on
 * the iframe's `load` event, after an async getCurrentMember() — so the widget ALWAYS
 * mounts without a token and receives one a moment later, or never. A route that 401s
 * without one (as /api/portal does) is unreadable at exactly the moment this content has
 * to paint. Gating it would mean rendering an empty shelf and then popping content in.
 *
 * Nothing here is private. Two independent guarantees:
 *
 *   1. A database CHECK constraint (content_items_getting_started_public_only) rejects any
 *      row with a client_id or cohort_id, so a client recording or cohort file can never
 *      be flagged into Getting Started in the first place.
 *   2. getGettingStarted() repeats the same filter in its WHERE clause.
 *
 * And the URLs are already public: POST /api/search hands out these same unsigned R2 links
 * to anonymous callers today. This route exposes no link that search wouldn't.
 *
 * ONE GENUINE DELTA, worth stating rather than leaving to be rediscovered: an item can be
 * both Getting Started AND hidden_from_search — that combination is the "how to use this
 * tool" video the feature was designed around. So this route surfaces a handful of rows
 * that search deliberately withholds. They are unlisted, not private, and the constraint
 * above still applies to every one of them.
 *
 * Shares getGettingStarted() with /api/portal, which keeps its own copy of this data for
 * any future Webflow-rendered block. One query, two callers, no drift.
 */
export async function GET(req: NextRequest) {
  // Anti-nuisance only. One indexed query against a handful of rows, no paid API calls
  // downstream, so this is about stopping a runaway script rather than protecting spend.
  // See lib/rate-limit.ts for the per-process caveat.
  const rate = checkRate(`getting-started:${getClientIp(req)}`, 30, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const gettingStarted = await getGettingStarted();
    return NextResponse.json(gettingStarted, {
      // The shelf changes only when Lindsay edits it in the dashboard, and five minutes of
      // staleness on an on-ramp is invisible to a member.
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    // The widget treats any failure as "no shelf" and renders its old empty idle state, so
    // this never breaks search. Still a 500 rather than an empty 200: an empty shelf and a
    // broken query should not look identical in the logs.
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
