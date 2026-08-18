import { NextResponse } from 'next/server';
import { getChallenge, updateChallenge, deleteChallenge } from '@/lib/db';
import { UpdateChallengeSchema } from '@/lib/schemas';
import { challengeAccess, unlockInstant } from '@/lib/challenge-days';

export const runtime = 'nodejs';

// GET /api/challenges/[id] — the run plus the schedule it produces.
//
// The unlock instants are computed and returned rather than left for the dashboard to
// re-derive: they are the whole product of the reveal_time/timezone/start_date settings,
// and the operator needs to see the actual dates to trust them. Recomputing this in the
// browser would be a second implementation of the DST-sensitive rule.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const challenge = await getChallenge(id);
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  const access = challengeAccess(challenge);
  const days = [];
  for (let day = 1; day <= challenge.total_days; day++) {
    const at = unlockInstant(challenge, day);
    days.push({
      day,
      unlocks_at: at ? at.toISOString() : null,
      unlocked: access.unlocked.includes(day),
    });
  }

  return NextResponse.json({ challenge, days, access });
}

// PATCH /api/challenges/[id] — edit settings, or change status.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const challenge = await updateChallenge(id, parsed.data);
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, challenge });
}

// DELETE /api/challenges/[id] — remove a run entirely.
//
// Safe in a way a cohort is not: nothing references a challenge, so there is nothing to
// orphan. Archiving is still the better habit for a run that actually happened, which is
// why the dashboard offers that first.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteChallenge(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
