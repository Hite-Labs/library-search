import { NextRequest, NextResponse } from 'next/server';
import { createCmsItem, patchCmsItem, publishItem } from '@/lib/webflow';
import { embed, buildEmbeddingText } from '@/lib/embeddings';
import { insertContentItem, updateWebflowItemId } from '@/lib/db';
import { FinalizeUploadSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = FinalizeUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Step 1: Create Webflow CMS item
  let webflowItemId: string;
  try {
    webflowItemId = await createCmsItem({
      title: data.title,
      description: data.description,
      mediaType: data.mediaType,
      mediaUrl: data.publicUrl,
      durationSeconds: data.durationSeconds,
      useCases: data.useCases,
      modality: data.modality,
      moodTags: data.moodTags,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'webflow', error: String(err) }, { status: 500 });
  }

  // Step 2: Publish Webflow item
  try {
    await publishItem(webflowItemId);
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'publish', error: String(err), webflowItemId }, { status: 500 });
  }

  // Step 3: Generate embedding
  let embedding: number[];
  try {
    const embeddingText = buildEmbeddingText({
      title: data.title,
      description: data.description,
      useCases: data.useCases,
      modality: data.modality,
      moodTags: data.moodTags,
    });
    embedding = await embed(embeddingText);
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'embed', error: String(err), webflowItemId }, { status: 500 });
  }

  // Step 4: Insert into Neon
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
      embedding,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'db', error: String(err), webflowItemId }, { status: 500 });
  }

  // Step 5: Cross-link — store Neon ID back in Webflow, and Webflow ID in Neon
  try {
    await Promise.all([
      patchCmsItem(webflowItemId, { 'neon-id': neonId }),
      updateWebflowItemId(neonId, webflowItemId),
    ]);
  } catch (err) {
    // Non-fatal: data is persisted, cross-link failed
    return NextResponse.json(
      { ok: true, neonId, webflowItemId, publicUrl: data.publicUrl, crosslinkWarning: String(err) },
    );
  }

  return NextResponse.json({ ok: true, neonId, webflowItemId, publicUrl: data.publicUrl });
}
