import { NextResponse } from 'next/server';
import { updateCohortSession, deleteCohortSession } from '@/lib/db';
import { UpdateCohortSessionSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// PATCH /api/cohorts/[id]/sessions/[sid] — edit a scheduled session
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const { sid } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateCohortSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const session = await updateCohortSession(sid, parsed.data);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session });
}

// DELETE /api/cohorts/[id]/sessions/[sid] — remove a scheduled session
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const { sid } = await params;
  await deleteCohortSession(sid);
  return NextResponse.json({ ok: true });
}
