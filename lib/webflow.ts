import { env } from './env';

const BASE_URL = 'https://api.webflow.com/v2';

const headers = {
  Authorization: `Bearer ${env.WEBFLOW_API_KEY}`,
  'accept-version': '2.0.0',
  'Content-Type': 'application/json',
};

// Cached option ID maps — populated on first use via fetchOptionIds()
let mediaTypeOptions: Record<string, string> | null = null;
let modalityOptions: Record<string, string> | null = null;

async function fetchOptionIds(): Promise<void> {
  if (mediaTypeOptions && modalityOptions) return;

  const res = await fetch(`${BASE_URL}/collections/${env.WEBFLOW_COLLECTION_ID}`, { headers });
  if (!res.ok) throw new Error(`Webflow collection fetch failed: ${res.status}`);
  const data = await res.json();

  const fields: Array<{ slug: string; validations?: { options?: Array<{ id: string; name: string }> } }> =
    data.fields ?? [];

  mediaTypeOptions = {};
  modalityOptions = {};

  for (const field of fields) {
    if (field.slug === 'media-type' && field.validations?.options) {
      for (const opt of field.validations.options) {
        mediaTypeOptions[opt.name.toLowerCase()] = opt.id;
      }
    }
    if (field.slug === 'modality' && field.validations?.options) {
      for (const opt of field.validations.options) {
        modalityOptions[opt.name.toLowerCase()] = opt.id;
      }
    }
  }
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  // Append a short random suffix so slugs are unique even when two items share a
  // title or a file is re-uploaded — Webflow rejects duplicate slugs with a 400.
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : suffix;
}

export async function createCmsItem(data: {
  title: string;
  description: string;
  mediaType: 'audio' | 'video' | 'pdf';
  mediaUrl: string;
  durationSeconds: number | null;
  useCases: string;
  modality: string;
  moodTags: string;
}): Promise<string> {
  await fetchOptionIds();

  // Webflow's Media Type option names are Audio / Video / Written. Map our
  // internal mediaType (audio/video/pdf) onto the lowercased option-name keys.
  const mediaTypeOptionName =
    data.mediaType === 'pdf' ? 'written' : data.mediaType; // 'audio' | 'video' | 'written'
  const mediaTypeId = mediaTypeOptions![mediaTypeOptionName];
  if (!mediaTypeId) throw new Error(`Unknown media type option: ${data.mediaType}`);

  const modalityId = modalityOptions![data.modality.toLowerCase()];
  if (!modalityId) throw new Error(`Unknown modality option: ${data.modality}`);

  // Webflow has separate audio-url / video-url fields (no field for PDFs).
  const mediaUrlField =
    data.mediaType === 'video'
      ? { 'video-url': data.mediaUrl }
      : data.mediaType === 'audio'
        ? { 'audio-url': data.mediaUrl }
        : {};

  const payload = {
    isArchived: false,
    isDraft: false,
    fieldData: {
      name: data.title,
      slug: slugify(data.title),
      description: data.description,
      'media-type': mediaTypeId,
      ...mediaUrlField,
      duration: data.durationSeconds,
      'use-cases': data.useCases,
      modality: modalityId,
      'mood-tags': data.moodTags,
    },
  };

  const res = await fetch(
    `${BASE_URL}/collections/${env.WEBFLOW_COLLECTION_ID}/items`,
    { method: 'POST', headers, body: JSON.stringify(payload) },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webflow createCmsItem failed: ${res.status} ${text}`);
  }

  const item = await res.json();
  return item.id as string;
}

/**
 * Patch an existing CMS item's editable metadata, mirroring createCmsItem's field
 * mapping so an edited item and a freshly-created one end up shaped identically.
 *
 * This exists rather than callers reaching for patchCmsItem directly because
 * Webflow's Option fields (media-type, modality) take option UUIDs, not names.
 * The name→id maps are module-private and lazily fetched, so resolving them here
 * keeps that knowledge inside this module.
 *
 * Notably does NOT touch the slug. slugify() appends a random suffix, so
 * re-slugifying on a title edit would change the live Webflow URL and orphan every
 * stored content_page_url and every existing search result link. The slug is frozen
 * once the item is created.
 *
 * media-type and the audio-url/video-url fields are likewise never patched — they
 * describe the stored object, which editing metadata doesn't change.
 *
 * Pass undefined for any field to leave Webflow's value alone. An empty modality
 * clears the field rather than attempting (and failing) to resolve an option id.
 */
export async function updateCmsItem(
  itemId: string,
  data: {
    title?: string;
    description?: string;
    durationSeconds?: number | null;
    useCases?: string;
    modality?: string | null;
    moodTags?: string;
  },
): Promise<void> {
  const fieldData: Record<string, string | number | null> = {};

  if (data.title !== undefined) fieldData.name = data.title;
  if (data.description !== undefined) fieldData.description = data.description;
  if (data.durationSeconds !== undefined) fieldData.duration = data.durationSeconds;
  if (data.useCases !== undefined) fieldData['use-cases'] = data.useCases;
  if (data.moodTags !== undefined) fieldData['mood-tags'] = data.moodTags;

  if (data.modality !== undefined) {
    if (!data.modality) {
      // Clearing is fine; sending an unresolvable option name is not.
      fieldData.modality = null;
    } else {
      await fetchOptionIds();
      const modalityId = modalityOptions![data.modality.toLowerCase()];
      if (!modalityId) throw new Error(`Unknown modality option: ${data.modality}`);
      fieldData.modality = modalityId;
    }
  }

  if (Object.keys(fieldData).length === 0) return;
  await patchCmsItem(itemId, fieldData);
}

export async function patchCmsItem(
  itemId: string,
  // Widened to include numbers: the `duration` field is an integer, not a string.
  fieldData: Record<string, string | number | null>,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/collections/${env.WEBFLOW_COLLECTION_ID}/items/${itemId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fieldData }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webflow patchCmsItem failed: ${res.status} ${text}`);
  }
}

export async function publishItem(itemId: string): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/collections/${env.WEBFLOW_COLLECTION_ID}/items/publish`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ itemIds: [itemId] }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webflow publishItem failed: ${res.status} ${text}`);
  }
}
