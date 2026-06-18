import { NextRequest, NextResponse } from 'next/server';
import { listCohorts, createCohort } from '@/lib/db';
import { CreateCohortSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/cohorts?status=active — list cohorts with member counts
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const cohorts = await listCohorts(status);
  return NextResponse.json({ cohorts });
}

// POST /api/cohorts — create a cohort
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateCohortSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const cohort = await createCohort(parsed.data);
  return NextResponse.json({ ok: true, cohort });
}
