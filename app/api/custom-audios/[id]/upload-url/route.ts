import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCustomAudio } from '@/lib/custom-audios';
import { getCustomAudioKey, getPresignedPutUrl } from '@/lib/r2';

export const runtime = 'nodejs';

const Body = z.object({
  filename: z.string().min(1).max(300),
  contentType: z.string().regex(/^(audio|video)\//, 'Upload an audio or video file'),
});

/**
 * POST /api/custom-audios/[id]/upload-url — a presigned PUT for this audio's file, under the
 * owner's per-client prefix. Same browser-direct upload as the rest of the dashboard; the key
 * is then saved with PATCH /api/custom-audios/[id].
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const audio = await getCustomAudio(id);
  if (!audio) return NextResponse.json({ error: 'Custom audio not found' }, { status: 404 });

  const r2Key = getCustomAudioKey(audio.client_id, parsed.data.filename);
  const uploadUrl = await getPresignedPutUrl(r2Key, parsed.data.contentType);
  return NextResponse.json({
    uploadUrl,
    r2Key,
    mediaType: parsed.data.contentType.startsWith('video/') ? 'video' : 'audio',
  });
}
