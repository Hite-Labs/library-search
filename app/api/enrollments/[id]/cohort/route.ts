import { NextResponse } from 'next/server';
import { getCohortForEnrollment, getCohortSessions } from '@/lib/db';

export const runtime = 'nodejs';

// GET /api/enrollments/[id]/cohort — the cohort (+ its sessions) a cohort enrollment belongs to.
// Used by the cohort-aware member view on the client detail page.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cohort = await getCohortForEnrollment(id);
  if (!cohort) {
    return NextResponse.json({ error: 'No cohort for this enrollment' }, { status: 404 });
  }
  const sessions = await getCohortSessions(cohort.id);
  return NextResponse.json({ cohort, sessions });
}
