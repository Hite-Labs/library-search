import { NextResponse } from 'next/server';
import { addEnrollment, getClientWithEnrollments } from '@/lib/db';
import { AddEnrollmentSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/clients/[id]/enrollments — start a new pack for an existing client
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = AddEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const client = await getClientWithEnrollments(id);
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const enrollment = await addEnrollment(id, parsed.data);
  return NextResponse.json({ ok: true, enrollment });
}
