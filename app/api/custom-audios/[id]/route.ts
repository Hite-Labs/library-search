import { NextResponse } from 'next/server';
import { deleteCustomAudio, getCustomAudio, updateCustomAudio } from '@/lib/custom-audios';
import { deleteR2Object, isCustomAudioKeyFor } from '@/lib/r2';
import { CustomAudioUpdateSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

/**
 * PATCH /api/custom-audios/[id] — edit, attach/replace the file, or change status (CC-13).
 *
 * Replacing the file points the row at the new key first and only then deletes the old
 * object, so a failed delete leaves an orphan in the bucket rather than a broken portal link.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = CustomAudioUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const current = await getCustomAudio(id);
  if (!current) return NextResponse.json({ error: 'Custom audio not found' }, { status: 404 });
  // Only a key minted for this audio's owner — never an arbitrary object in the bucket.
  if (parsed.data.r2Key && !isCustomAudioKeyFor(current.client_id, parsed.data.r2Key)) {
    return NextResponse.json({ error: 'That file key does not belong to this client' }, { status: 400 });
  }

  let out;
  try {
    out = await updateCustomAudio(id, parsed.data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 });
  }
  if (!out) return NextResponse.json({ error: 'Custom audio not found' }, { status: 404 });

  let r2Warning: string | undefined;
  if (out.before.r2_key && out.before.r2_key !== out.after.r2_key) {
    try {
      await deleteR2Object(out.before.r2_key);
    } catch (err) {
      r2Warning = String(err);
    }
  }
  return NextResponse.json({ audio: out.after, ...(r2Warning ? { r2Warning } : {}) });
}

// DELETE /api/custom-audios/[id] — remove the delivery and, best-effort, its file.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteCustomAudio(id);
  if (!deleted) return NextResponse.json({ error: 'Custom audio not found' }, { status: 404 });
  if (deleted.r2_key) {
    try {
      await deleteR2Object(deleted.r2_key);
    } catch (err) {
      return NextResponse.json({ ok: true, r2Warning: String(err) });
    }
  }
  return NextResponse.json({ ok: true });
}
