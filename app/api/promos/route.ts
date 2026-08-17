import { NextResponse } from 'next/server';
import { listAllPromos, createPromo } from '@/lib/db';
import { PromoCreateSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/promos — every promo, including inactive and expired, for the dashboard.
// The portal gets its own filtered set through /api/portal; this is the operator view.
export async function GET() {
  const promos = await listAllPromos();
  return NextResponse.json({ ok: true, promos });
}

// POST /api/promos — create a promo.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = PromoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const promo = await createPromo(parsed.data);
  return NextResponse.json({ ok: true, promo });
}
