import { NextResponse } from 'next/server';
import {
  getCohort,
  getCohortSessions,
  getCohortRoster,
  getCohortContent,
  updateCohort,
} from '@/lib/db';
import { UpdateCohortSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/cohorts/[id] — cohort + schedule + roster + shared content
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cohort = await getCohort(id);
  if (!cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  }
  const [sessions, roster, content] = await Promise.all([
    getCohortSessions(id),
    getCohortRoster(id),
    getCohortContent(id),
  ]);
  return NextResponse.json({ cohort, sessions, roster, content });
}

// PATCH /api/cohorts/[id] — update goal/status/current_session/etc.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateCohortSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const cohort = await updateCohort(id, parsed.data);
  if (!cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, cohort });
}
