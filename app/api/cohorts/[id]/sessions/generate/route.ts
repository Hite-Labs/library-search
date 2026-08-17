import { NextResponse } from 'next/server';
import { getCohort, generateCohortSchedule, getCohortContent } from '@/lib/db';
import { GenerateScheduleSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/cohorts/[id]/sessions/generate — auto-plot the cohort's schedule.
// Generates `totalSessions` dated cohort_sessions rows from `startDate` spaced by cadence.
// Each row stays editable afterward (holiday shifts) via the sessions PATCH endpoint.
// Pass replaceExisting to re-plot instead of adding a second overlapping set.
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

  // Replacing deletes cohort_sessions rows, and content_items.cohort_session_id has no
  // ON DELETE behaviour — attached recordings and files would survive pointing at rows that
  // no longer exist, dropping out of the portal's per-session lists with no way to get them
  // back except re-attaching by hand. Refuse rather than destroy: the coach can detach the
  // files, or edit the dates in place, which is the non-destructive path the UI already has.
  if (parsed.data.replaceExisting) {
    const attached = (await getCohortContent(id)).filter((c) => c.cohort_session_id);
    if (attached.length > 0) {
      return NextResponse.json(
        {
          error:
            `${attached.length} file(s) are attached to this cohort's sessions. Replacing the ` +
            `schedule would leave them unreachable. Detach them first, or edit the existing ` +
            `session dates instead.`,
        },
        { status: 409 },
      );
    }
  }

  const sessions = await generateCohortSchedule(id, parsed.data);
  return NextResponse.json({ ok: true, sessions });
}
