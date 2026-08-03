import { NextResponse } from 'next/server';
import { getCohort, addCohortMember, removeCohortMember } from '@/lib/db';
import { AddCohortMemberSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/cohorts/[id]/members — add a member, either by picking an existing client
// (clientId) or by name + email. Reuses the person's record, refuses duplicates, and
// provisions Memberstack so cohort-only people can reach the portal.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = AddCohortMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const cohort = await getCohort(id);
  if (!cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  }
  try {
    const result = await addCohortMember({ cohortId: id, ...parsed.data });
    return NextResponse.json({
      ok: true,
      client: result.client,
      enrollment: result.enrollment,
      reusedClient: result.reusedClient,
      alreadyMember: result.alreadyMember,
      provisionWarning: result.provisionWarning,
      memberProvisioned: result.memberProvisioned,
      plansAttached: result.plansAttached,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// DELETE /api/cohorts/[id]/members?enrollmentId=… — remove a member from this cohort.
// Deletes the cohort enrollment only: the person's client record, their individual packs,
// and their Memberstack plan are all left alone (see removeCohortMember).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const enrollmentId = new URL(req.url).searchParams.get('enrollmentId');
  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollmentId is required' }, { status: 400 });
  }
  const removed = await removeCohortMember(id, enrollmentId);
  if (!removed) {
    return NextResponse.json({ error: 'Not a member of this cohort' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, enrollment: removed });
}
