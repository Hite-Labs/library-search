import { VoyageAIClient } from 'voyageai';
import { env } from './env';

let _client: VoyageAIClient | null = null;
function getClient(): VoyageAIClient {
  if (!_client) _client = new VoyageAIClient({ apiKey: env.VOYAGE_API_KEY });
  return _client;
}

export async function embed(text: string): Promise<number[]> {
  const response = await getClient().embed({
    model: 'voyage-3',
    input: text,
  });
  const embedding = response.data?.[0]?.embedding;
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
