import { env } from './env';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Which side of the comparison a piece of text sits on.
 *
 * Voyage embeds a short question and a long description into different regions unless you
 * say which is which, so an asymmetric model needs this to place them comparably. Omitting
 * it was costing roughly two thirds of the similarity on real matches:
 *
 *              no input_type   input_type:'query'
 *   confidence     0.144            0.471
 *   hypnosis       0.269            0.469
 *   tapping        0.267            0.420
 *   pizza recipe   0.093            0.080   ← nonsense stays low either way
 *
 * A one-word search for a title we actually stock scored 0.144 and was discarded, which is
 * why searching "confidence" returned nothing while "Camera Confidence" sat in the library.
 *
 * Documents keep 'document'. The existing rows were embedded with no input_type at all, and
 * are NOT being re-embedded: the table above is measured against those very rows, so the
 * pairing is verified as-is, and re-embedding all 15 costs a Voyage run against a 3 RPM free
 * tier for a gain nobody has demonstrated. Worth revisiting together if the library grows.
 */
export type EmbedInputType = 'query' | 'document';

export async function embed(text: string, inputType: EmbedInputType = 'document'): Promise<number[]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-3', input: text, input_type: inputType }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage embed failed: ${response.status} ${body}`);
  }

  const json = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) throw new Error('Voyage embed returned no embedding');
  return embedding;
}

export function buildEmbeddingText(data: {
  title: string;
  description: string;
  useCases: string;
  modality: string;
  moodTags: string;
  transcript?: string;
}): string {
  return [
    data.title,
    data.description,
    data.useCases,
    data.modality,
    data.moodTags,
    data.transcript ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}
