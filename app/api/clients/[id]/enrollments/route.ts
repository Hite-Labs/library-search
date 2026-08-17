import { NextResponse } from 'next/server';
import { addEnrollment, ensureMemberProvisioned, getClientWithEnrollments } from '@/lib/db';
import { AddEnrollmentSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/clients/[id]/enrollments — start a new pack for an existing client
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = AddEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const found = await getClientWithEnrollments(id);
  if (!found) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  const { client } = found;

  // A cohort enrollment is meaningless without a cohort_id, and this route has no cohort
  // to attach — joining one goes through POST /api/cohorts/[id]/members. Refuse rather
  // than insert an orphan cohort row and grant the cohort plan behind it.
  if (parsed.data.programType === 'cohort') {
    return NextResponse.json(
      { error: 'Join a cohort via /api/cohorts/[id]/members — this route creates individual packs.' },
      { status: 400 },
    );
  }

  const enrollment = await addEnrollment(id, parsed.data);

  // Starting a pack is an entitlement change: a cohort-only person taking an individual
  // pack needs the individual plan, or the portal keeps hiding that panel. Runs after the
  // insert so a Memberstack outage can't block the enrollment — the warning surfaces
  // instead, and /reconcile catches anything that slipped.
  const provisioned = await ensureMemberProvisioned(client, {
    firstName: client.name.split(' ')[0],
    lastName: client.name.split(' ').slice(1).join(' ') || undefined,
    goal: parsed.data.goal,
    totalSessions: parsed.data.totalSessions,
    planType: ['individual'],
  });

  return NextResponse.json({
    ok: true,
    enrollment,
    provisionWarning: provisioned.provisionWarning,
    plansAttached: provisioned.plansAttached,
    memberProvisioned: provisioned.memberProvisioned,
  });
}
