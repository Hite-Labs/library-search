import { NextResponse } from 'next/server';
import { updatePromo, deletePromo } from '@/lib/db';
import { PromoUpdateSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// PATCH /api/promos/[id] — partial update. Omitted fields are left untouched; the
// clear* flags are how a nullable field gets emptied, since omission already means
// "leave alone".
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PromoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const promo = await updatePromo(id, parsed.data);
  if (!promo) {
    return NextResponse.json({ error: 'Promo not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, promo });
}

// DELETE /api/promos/[id] — hard delete. Retiring an offer should normally be
// `active: false` instead, which keeps it available to switch back on for the next launch.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deletePromo(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Promo not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
