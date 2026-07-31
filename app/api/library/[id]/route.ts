import { NextRequest, NextResponse } from 'next/server';
import { getLibraryItem, updateLibraryItem, LibraryItemDetail } from '@/lib/db';
import { embed, buildEmbeddingText } from '@/lib/embeddings';
import { updateCmsItem, publishItem } from '@/lib/webflow';
import { UpdateLibraryItemSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

/** GET /api/library/[id] — one public-library item, including its full transcript. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await getLibraryItem(id);
  if (!item) {
    return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
  }
  return NextResponse.json({ item });
}

/**
 * PATCH /api/library/[id] — edit a public-library item's metadata.
 *
 * Three systems have to agree afterwards: Neon (the source of truth), the Voyage
 * embedding (what search actually matches on), and Webflow (what the public site
 * shows). The ordering below is the inverse of upload/finalize, deliberately:
 * finalize writes Webflow first because it needs the returned item id, whereas here
 * every system already has a row and the only question is which one is left stale
 * if something fails.
 *
 *   1. embed   — slowest and most failure-prone, but pure. Failing here mutates nothing.
 *   2. Neon    — metadata + vector in one atomic UPDATE. Once this lands the edit is real.
 *   3. Webflow — patch + republish, best-effort. Failures come back as warnings.
 *
 * A stale Webflow page is a visible lag the user fixes by pressing Save again (the
 * whole path is idempotent). The reverse — fresh Webflow, stale Neon — would make
 * search wrong and be invisible, which is the state this ordering rules out.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateLibraryItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Load the current row: to 404 ids that aren't public-library items, to get the
  // transcript (an embedding input the client never sends), and to merge partial
  // edits into the full text the embedding is rebuilt from.
  const existing = await getLibraryItem(id);
  if (!existing) {
    return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
  }

  const merged = {
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    useCases: data.useCases ?? existing.use_cases,
    modality: data.modality !== undefined ? data.modality : existing.modality,
    moodTags: data.moodTags ?? existing.mood_tags,
  };

  // Step 1: rebuild the embedding from the POST-edit text.
  let embedding: number[];
  try {
    embedding = await embed(
      buildEmbeddingText({
        title: merged.title,
        description: merged.description,
        useCases: merged.useCases,
        modality: merged.modality ?? '',
        moodTags: merged.moodTags,
        transcript: existing.transcript ?? undefined,
      }),
    );
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'embed', error: String(err) }, { status: 500 });
  }

  // Step 2: metadata + vector together, so the two can never drift apart.
  let updated: LibraryItemDetail | null;
  try {
    updated = await updateLibraryItem(
      id,
      {
        title: data.title,
        description: data.description,
        useCases: data.useCases,
        modality: data.modality,
        moodTags: data.moodTags,
        durationSeconds: data.durationSeconds,
      },
      embedding,
    );
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'db', error: String(err) }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
  }

  // Step 3: mirror to Webflow, then republish — a PATCH alone only updates the
  // staged item, so without the publish the live site keeps serving old values.
  // Both are best-effort now that Neon is correct.
  //
  // webflow_item_id is null for rows that never made it into the CMS (a finalize
  // that failed at the webflow step). Those stay fully editable; we just skip the
  // CMS half rather than refusing the edit.
  let webflowWarning: string | undefined;
  let publishWarning: string | undefined;
  if (existing.webflow_item_id) {
    try {
      await updateCmsItem(existing.webflow_item_id, {
        title: data.title,
        description: data.description,
        durationSeconds: data.durationSeconds,
        useCases: data.useCases,
        modality: data.modality,
        moodTags: data.moodTags,
      });
      try {
        await publishItem(existing.webflow_item_id);
      } catch (err) {
        publishWarning = `Saved, but the Webflow item could not be republished: ${String(err)}`;
      }
    } catch (err) {
      webflowWarning = `Saved to the dashboard, but the Webflow CMS update failed: ${String(err)}`;
    }
  }

  return NextResponse.json({ ok: true, item: updated, webflowWarning, publishWarning });
}
