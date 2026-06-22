import { NextRequest, NextResponse } from 'next/server';
import { listEnrollments, createClientWithEnrollment } from '@/lib/db';
import { CreateClientSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/clients?status=active — list enrollments (with client info) for the dashboard (L-07)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const enrollments = await listEnrollments(status);
  return NextResponse.json({ enrollments });
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
      reusedClient: result.reusedClient,
      provisionWarning: result.provisionWarning,
      memberProvisioned: result.memberProvisioned,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
