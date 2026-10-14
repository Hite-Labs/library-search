import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  backfillCoachingLibraryAccess,
  getCoachingLibraryDays,
  isLibraryAccessConfigured,
  listBackfillCandidates,
  setCoachingLibraryDays,
} from '@/lib/library-access';

export const runtime = 'nodejs';

// GET /api/reconcile/library-access — the days setting, plus the current coaching clients
// who have never been given library access (what the one-off grant would cover).
export async function GET() {
  try {
    const [days, candidates] = await Promise.all([getCoachingLibraryDays(), listBackfillCandidates()]);
    return NextResponse.json({ ok: true, configured: isLibraryAccessConfigured(), days, candidates });
  } catch (err) {
    // Most likely db/library-access.sql hasn't been run yet.
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

const PatchSchema = z.object({ days: z.number().int().min(1).max(365) });

// PATCH /api/reconcile/library-access — change how many days access lasts after the last session.
export async function PATCH(req: Request) {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Days must be a whole number from 1 to 365' }, { status: 400 });
  }
  await setCoachingLibraryDays(parsed.data.days);
  return NextResponse.json({ ok: true, days: parsed.data.days });
}

// POST /api/reconcile/library-access — the one-off grant: give every listed client access.
export async function POST() {
  if (!isLibraryAccessConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'MEMBERSTACK_MEMBERSHIP_INCLUDED_PLAN_ID is not set on the server' },
      { status: 503 },
    );
  }
  const out = await backfillCoachingLibraryAccess();
  return NextResponse.json({ ok: true, ...out });
}
