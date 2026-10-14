import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { secretMatches } from '@/lib/secret';
import { runPendingSteps } from '@/lib/intake/runner';
import { runDailyLibraryExpiry } from '@/lib/library-access';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/jobs/tick — run whatever intake steps are due (CC-2), and once a day the
 * coaching library expiry (lib/library-access.ts).
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
  // Coaching library expiry. Does real work at most once a day (it claims the run itself),
  // so riding on the minute tick costs one cheap query the rest of the time.
  const libraryExpiry = await runDailyLibraryExpiry().catch((err) => {
    console.error('[tick] library expiry failed:', err);
    return null;
  });
  return NextResponse.json({ ok: true, ...out, libraryExpiry });
}
