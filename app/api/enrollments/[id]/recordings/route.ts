import { NextResponse } from 'next/server';
import {
  getEnrollment,
  attachRecordingToClient,
  insertClientRecording,
} from '@/lib/db';
import { AttachRecordingSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// POST /api/enrollments/[id]/recordings — attach a private downloadable recording
// to this enrollment's client (L-04). Two modes:
//   (a) contentId  → tag an existing content_items row (e.g. from the upload flow)
//   (b) title + r2Key + publicUrl + mediaType → create a new row from a pasted R2 link
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: enrollmentId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = AttachRecordingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const enrollment = await getEnrollment(enrollmentId);
  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  if (d.contentId) {
    // Mode (a): tag an existing content row as this client's private recording.
    await attachRecordingToClient(d.contentId, {
      clientId: enrollment.client_id,
      sessionLabel: d.sessionLabel,
      enrollmentId,
    });
    return NextResponse.json({ ok: true, contentId: d.contentId });
  }

  // Mode (b): create a new private recording row from a pasted R2 link.
  const contentId = await insertClientRecording({
    title: d.title!,
    clientId: enrollment.client_id,
    enrollmentId,
    sessionLabel: d.sessionLabel,
    mediaType: d.mediaType!,
    r2Key: d.r2Key!,
    publicUrl: d.publicUrl!,
  });
  return NextResponse.json({ ok: true, contentId });
}
