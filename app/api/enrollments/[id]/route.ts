import { NextResponse } from 'next/server';
import { updateEnrollment } from '@/lib/db';
import { UpdateEnrollmentSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// PATCH /api/enrollments/[id] — update goal, status (incl. mark complete), next session (L-05/L-08/C-06)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const enrollment = await updateEnrollment(id, parsed.data);
  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, enrollment });
}
