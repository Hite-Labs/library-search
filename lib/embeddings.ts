import { env } from './env';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

export async function embed(text: string): Promise<number[]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-3', input: text }),
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
}): string {
  return [data.title, data.description, data.useCases, data.modality, data.moodTags]
    .filter(Boolean)
    .join(' ');
}
