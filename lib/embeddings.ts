import OpenAI from 'openai';
import { env } from './env';

let _openai: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

export async function embed(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
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
