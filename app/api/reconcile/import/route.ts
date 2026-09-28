import { NextResponse } from 'next/server';
import { importMissingMembers } from '@/lib/db';
import { listMembersWithPlans, isMemberstackConfigured } from '@/lib/memberstack';

export const runtime = 'nodejs';

/**
 * POST /api/reconcile/import — create a client row for every Memberstack member the
 * dashboard doesn't have yet (CC-0). Adds people only: no enrollments, no plan changes, so
 * nobody's portal access moves. Safe to press twice; the second press imports nothing.
 */
export async function POST() {
  if (!isMemberstackConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Memberstack is not configured (MEMBERSTACK_SECRET_KEY unset)' },
      { status: 503 },
    );
  }

  const members = await listMembersWithPlans();
  if (!members) {
    return NextResponse.json(
      { ok: false, error: 'Could not read members from Memberstack' },
      { status: 503 },
    );
  }

  try {
    const imported = await importMissingMembers(members);
    return NextResponse.json({ ok: true, imported });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
