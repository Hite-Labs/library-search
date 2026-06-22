import { NextResponse } from 'next/server';
import {
  getClientWithEnrollments,
  getSessionLogs,
  getClientRecordings,
  deleteClient,
} from '@/lib/db';

export const runtime = 'nodejs';

// GET /api/clients/[id] — client + all enrollments (active + history), with the
// active enrollment's session logs, plus the client's recordings (L-02).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getClientWithEnrollments(id);
  if (!data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const active = data.enrollments.find((e) => e.status === 'active') ?? data.enrollments[0];
  const activeLogs = active ? await getSessionLogs(active.id) : [];
  const recordings = await getClientRecordings(id);

  return NextResponse.json({
    client: data.client,
    enrollments: data.enrollments,
    activeEnrollmentId: active?.id ?? null,
    activeLogs,
    recordings,
  });
}

// DELETE /api/clients/[id] — remove the client + their enrollments/session logs (cascade)
// and detach private recordings. Leaves the Memberstack member untouched (delete that in
// the Memberstack dashboard if you need to fully free the email).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteClient(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
