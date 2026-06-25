import { NextResponse } from 'next/server';
import { deleteClientRecording } from '@/lib/db';
import { deleteR2Object } from '@/lib/r2';

export const runtime = 'nodejs';

// DELETE /api/recordings/[id] — remove a private client recording (DS-04).
// Deletes the content_items row first, then the underlying R2 object. Guarded in the DB
// layer to client-scoped rows only, so it can never delete public library content.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteClientRecording(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
  }
  // Best-effort R2 cleanup: the DB row is already gone, so a storage hiccup leaves an
  // orphaned object rather than a dangling reference. Don't fail the request on it.
  try {
    await deleteR2Object(deleted.r2_key);
  } catch (err) {
    return NextResponse.json({ ok: true, r2Warning: String(err) });
  }
  return NextResponse.json({ ok: true });
}
