import { NextResponse } from 'next/server';
import { getCohort, generateCohortSchedule } from '@/lib/db';
import { GenerateScheduleSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/cohorts/[id]/sessions/generate — auto-plot the cohort's schedule.
// Generates `totalSessions` dated cohort_sessions rows from `startDate` spaced by cadence.
// Each row stays editable afterward (holiday shifts) via the sessions PATCH endpoint.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = GenerateScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const cohort = await getCohort(id);
  if (!cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  }
  const sessions = await generateCohortSchedule(id, parsed.data);
  return NextResponse.json({ ok: true, sessions });
}
