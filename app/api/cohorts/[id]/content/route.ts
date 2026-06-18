import { NextResponse } from 'next/server';
import { getCohort, insertCohortContent } from '@/lib/db';
import { CohortContentSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/cohorts/[id]/content — attach shared content (paste-link) seen by all members
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CohortContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const cohort = await getCohort(id);
  if (!cohort) {
    return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
  }
  const contentId = await insertCohortContent({ cohortId: id, ...parsed.data });
  return NextResponse.json({ ok: true, contentId });
}
