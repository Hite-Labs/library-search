import { NextResponse } from 'next/server';
import { getCohort, getCohortSessions, addCohortSession } from '@/lib/db';
import { CohortSessionSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/cohorts/[id]/sessions — the cohort's scheduled sessions
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessions = await getCohortSessions(id);
  return NextResponse.json({ sessions });
}

// POST /api/cohorts/[id]/sessions — add a scheduled session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CohortSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const cohort = await getCohort(id);
  if (!cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  }
  const session = await addCohortSession(id, parsed.data);
  return NextResponse.json({ ok: true, session });
}
