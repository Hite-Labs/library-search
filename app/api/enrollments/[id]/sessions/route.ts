import { NextResponse } from 'next/server';
import { addSessionLog, getSessionLogs, getEnrollment } from '@/lib/db';
import { SessionLogSchema } from '@/lib/schemas';
import { refreshAfterSession } from '@/lib/library-access';

export const runtime = 'nodejs';

// GET /api/enrollments/[id]/sessions — session log history (L-02)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const logs = await getSessionLogs(id);
  return NextResponse.json({ logs });
}

// POST /api/enrollments/[id]/sessions — add a session log + increment counter (L-03/L-06)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = SessionLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const enrollment = await getEnrollment(id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  const { log, enrollment: updated } = await addSessionLog(id, parsed.data);

  // Coming back to coaching brings the library back if it had lapsed. Best-effort: the
  // session is saved either way, and a failure is logged rather than shown.
  if (updated.program_type === 'individual') {
    try {
      const library = await refreshAfterSession(updated.client_id, log.session_date);
      if (library.warning) console.error('[sessions] library access:', library.warning);
    } catch (err) {
      console.error('[sessions] library access refresh failed:', err);
    }
  }
  // Signal the UI to prompt "mark complete?" once the pack's sessions are done (L-08).
  const suggestComplete = updated.sessions_done >= updated.total_sessions && updated.status !== 'complete';

  return NextResponse.json({ ok: true, log, enrollment: updated, suggestComplete });
}
