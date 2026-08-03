import { NextRequest, NextResponse } from 'next/server';
import { listClientsWithEnrollments, createClientWithEnrollment } from '@/lib/db';
import { CreateClientSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/clients?status=active — one row per PERSON, each carrying their enrollments.
// A person matches the status filter if any of their enrollments does.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const clients = await listClientsWithEnrollments(status);
  return NextResponse.json({ clients });
}

// POST /api/clients — create a client + first enrollment (dedupes by email)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createClientWithEnrollment(parsed.data);
    return NextResponse.json({
      ok: true,
      client: result.client,
      enrollment: result.enrollment,
      cohortEnrollment: result.cohortEnrollment,
      reusedClient: result.reusedClient,
      alreadyMember: result.alreadyMember,
      provisionWarning: result.provisionWarning,
      memberProvisioned: result.memberProvisioned,
      plansAttached: result.plansAttached,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
