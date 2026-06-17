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
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

export async function patchCmsItem(
  itemId: string,
  fieldData: Record<string, string | null>,
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
