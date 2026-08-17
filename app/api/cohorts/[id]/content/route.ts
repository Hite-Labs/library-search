import { NextResponse } from 'next/server';
import { getCohort, insertCohortContent, isCohortMember } from '@/lib/db';
import { CohortContentSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/cohorts/[id]/content — attach content to a cohort. Scope depends on the body:
// cohortSessionId → that session's files; clientId → private to that member (the portal's
// my_files); neither → cohort-wide.
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

  // A private file is only reachable through the cohort it was filed under
  // (getCohortForPortal matches on cohort_id AND client_id), so scoping one to a
  // non-member would write a row nobody can ever read. Reject it rather than silently
  // creating an orphan.
  if (parsed.data.clientId && !(await isCohortMember(parsed.data.clientId, id))) {
    return NextResponse.json(
      { error: 'That client is not a member of this cohort' },
      { status: 400 },
    );
  }

  const contentId = await insertCohortContent({ cohortId: id, ...parsed.data });
  return NextResponse.json({ ok: true, contentId });
}
