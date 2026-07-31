import { NextResponse } from 'next/server';
import {
  getEnrollment,
  getSessionLogs,
  getEnrollmentContentByKind,
} from '@/lib/db';
import { getPresignedGetUrl } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * GET /api/enrollments/[id]/detail — everything the client detail page's program tab
 * needs for ONE enrollment: the enrollment itself, its session logs, and its own
 * recordings/resources.
 *
 * Split out from GET /api/clients/[id] so each tab loads its own body lazily on first
 * activation (the same pattern CohortInfo already uses) rather than the
 * client route fetching content for every program up front.
 *
 * Cohort enrollments have no per-member session log — progress is the cohort's, tracked
 * on the cohort itself — so `logs` is always empty for them.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const enrollment = await getEnrollment(id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  const isCohort = enrollment.program_type === 'cohort';
  const [logs, rawRecordings, rawResources] = await Promise.all([
    isCohort ? Promise.resolve([]) : getSessionLogs(enrollment.id),
    getEnrollmentContentByKind(enrollment.id, enrollment.client_id, 'recording'),
    getEnrollmentContentByKind(enrollment.id, enrollment.client_id, 'file'),
  ]);

  // Fresh time-limited signed GET URLs so "Open" works for private objects without ever
  // exposing the raw R2 url (S-03) — same treatment as GET /api/clients/[id].
  const sign = (rows: Awaited<ReturnType<typeof getEnrollmentContentByKind>>) =>
    Promise.all(rows.map(async (r) => ({ ...r, public_url: await getPresignedGetUrl(r.r2_key) })));
  const [recordings, resources] = await Promise.all([sign(rawRecordings), sign(rawResources)]);

  return NextResponse.json({ enrollment, logs, recordings, resources });
}
