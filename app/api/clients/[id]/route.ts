import { NextResponse } from 'next/server';
import { getClientWithEnrollments, deleteClient } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/clients/[id] — the person and the programs they're in.
 *
 * Deliberately slim: each program tab loads its own body (logs, recordings, resources)
 * from GET /api/enrollments/[id]/detail when it's first opened. Fetching all of it here
 * would mean signing R2 urls for every program on every page load, most of which the
 * user never looks at.
 *
 * `activeEnrollmentId` is only a hint for which tab to open first.
 */
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

  return NextResponse.json({
    client: data.client,
    enrollments: data.enrollments,
    activeEnrollmentId: active?.id ?? null,
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
