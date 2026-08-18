import { NextResponse } from 'next/server';
import { listAllPromos, createPromo, DuplicatePromoCodeError } from '@/lib/db';
import { PromoCreateSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/promos — every promo rule, including paused and expired, for the dashboard.
// The portal gets only the codes it qualifies for, through /api/portal.
export async function GET() {
  const promos = await listAllPromos();
  return NextResponse.json({ ok: true, promos });
}

// POST /api/promos — create a promo rule.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = PromoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const promo = await createPromo(parsed.data);
    return NextResponse.json({ ok: true, promo });
  } catch (err) {
    // A taken code is the operator's mistake to fix, not a server fault — answer with
    // something the dashboard can show verbatim.
    if (err instanceof DuplicatePromoCodeError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
