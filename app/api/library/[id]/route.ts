import { NextRequest, NextResponse } from 'next/server';
import {
  getLibraryItem,
  updateLibraryItem,
  setGettingStarted,
  setGettingStartedOrder,
  setHiddenFromSearch,
  LibraryItemDetail,
} from '@/lib/db';
import { embed, buildEmbeddingText } from '@/lib/embeddings';
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
 * Two things have to agree afterwards: Neon (the source of truth) and the Voyage
 * embedding (what search actually matches on).
 *
 *   1. embed — slowest and most failure-prone, but pure. Failing here mutates nothing.
 *   2. Neon  — metadata + vector in one atomic UPDATE. Once this lands the edit is real.
 *
 * There was a third step here: a best-effort Webflow CMS patch + republish, whose
 * failures came back as `webflowWarning` / `publishWarning`. It has been removed
 * along with the rest of the CMS write path — nothing ever read those items back,
 * so the mirror only ever produced warnings about a page no one was looking at.
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

  // The curation flags first, and separately.
  //
  // They are the only editable fields that do NOT feed buildEmbeddingText — marking
  // something Getting Started Primary changes where it appears, not what it is about.
  // So they are applied on their own, and a request carrying only flags returns before
  // the embed step below. That is what makes a toggle in the dashboard instant and
  // free, rather than a Voyage round-trip to recompute a vector that cannot have moved.
  //
  // Each is applied only when present, so a PATCH that sets one flag never disturbs the
  // other two.
  let flagged: LibraryItemDetail | null = null;

  if (data.gettingStarted !== undefined) {
    flagged = await setGettingStarted(id, data.gettingStarted);
    if (!flagged) {
      return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
    }
  }
  if (data.gettingStartedOrder !== undefined) {
    flagged = await setGettingStartedOrder(id, data.gettingStartedOrder);
  }
  if (data.hiddenFromSearch !== undefined) {
    flagged = await setHiddenFromSearch(id, data.hiddenFromSearch);
  }

  // Does this request carry anything updateLibraryItem needs to persist? If not, the
  // curation flags above were the whole request and we're done.
  const touchesMetadata =
    data.title !== undefined ||
    data.description !== undefined ||
    data.useCases !== undefined ||
    data.modality !== undefined ||
    data.moodTags !== undefined ||
    data.durationSeconds !== undefined;

  if (!touchesMetadata) {
    return NextResponse.json({ ok: true, item: flagged ?? existing });
  }

  // Of those fields, only these five feed buildEmbeddingText — duration is stored but
  // never embedded. So a duration-only edit still has to reach updateLibraryItem (it
  // persists the value), but it must not pay for a Voyage call to recompute a vector
  // whose input text hasn't changed. Hence two separate questions rather than one.
  const touchesEmbedding =
    data.title !== undefined ||
    data.description !== undefined ||
    data.useCases !== undefined ||
    data.modality !== undefined ||
    data.moodTags !== undefined;

  const merged = {
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    useCases: data.useCases ?? existing.use_cases,
    modality: data.modality !== undefined ? data.modality : existing.modality,
    moodTags: data.moodTags ?? existing.mood_tags,
  };

  // Step 1: rebuild the embedding from the POST-edit text — but only if that text
  // actually moved. undefined means "keep the stored vector" (see updateLibraryItem).
  let embedding: number[] | undefined;
  try {
    embedding = touchesEmbedding
      ? await embed(
          buildEmbeddingText({
            title: merged.title,
            description: merged.description,
            useCases: merged.useCases,
            modality: merged.modality ?? '',
            moodTags: merged.moodTags,
            transcript: existing.transcript ?? undefined,
          }),
        )
      : undefined;
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

  return NextResponse.json({ ok: true, item: updated });
}
