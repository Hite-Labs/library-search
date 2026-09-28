import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { secretMatches } from '@/lib/secret';
import { runPendingSteps } from '@/lib/intake/runner';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/jobs/tick — run whatever intake steps are due (CC-2).
 *
 * Called once a minute by the droplet's crontab (see docs/intake-setup.md). This is what
 * performs automatic retries after backoff, and what finishes steps a restart cut off.
 * PUBLIC in the proxy sense — cron has no cookie — so gated by X-Cron-Secret.
 *
 * Runs the drain inline rather than in after() so the cron's curl sees how much it did,
 * and a slow drain holds that curl rather than overlapping the next minute's call (the
 * runner's in-process guard would turn an overlap into a no-op anyway).
 */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get('x-cron-secret'), env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const out = await runPendingSteps({ budgetMs: 50_000 });
  return NextResponse.json({ ok: true, ...out });
}
