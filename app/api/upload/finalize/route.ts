import { NextRequest, NextResponse } from 'next/server';
import { embed, buildEmbeddingText } from '@/lib/embeddings';
import { insertContentItem } from '@/lib/db';
import { FinalizeUploadSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 300; // transcription polling can take minutes

/**
 * POST /api/upload/finalize — embed the analyzed content and store it in Neon.
 *
 * This used to open with a Webflow CMS create + publish, and only then embed and
 * insert. That ordering made a write-only mirror fatal to the upload: nothing in
 * the product ever read the CMS back (search goes to Neon + pgvector, playback uses
 * the R2 public_url, and content_page_url was never populated), yet a Webflow
 * outage, a rotated key or an unrecognised modality option would 500 the request
 * before the embedding ran, and nothing reached Neon at all.
 *
 * The CMS write is gone. Neon is the only store, which is what it already was in
 * practice — the removal just stops a dead dependency from being able to fail the
 * one that matters.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = FinalizeUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Transcript was computed in the earlier /api/upload/analyze step and passed back
  // (null for PDFs / manual entries). It feeds the embedding and is stored in Neon.
  const transcript = data.transcript;

  // Step 1: Generate embedding
  let embedding: number[];
  try {
    const embeddingText = buildEmbeddingText({
      title: data.title,
      description: data.description,
      useCases: data.useCases,
      modality: data.modality,
      moodTags: data.moodTags,
      transcript: transcript ?? undefined,
    });
    embedding = await embed(embeddingText);
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'embed', error: String(err) }, { status: 500 });
  }

  // Step 2: Insert into Neon
  let neonId: string;
  try {
    neonId = await insertContentItem({
      title: data.title,
      description: data.description,
      mediaType: data.mediaType,
      useCases: data.useCases,
      modality: data.modality,
      moodTags: data.moodTags,
      durationSeconds: data.durationSeconds,
      r2Key: data.r2Key,
      publicUrl: data.publicUrl,
      transcript,
      embedding,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'db', error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, neonId, publicUrl: data.publicUrl });
}
