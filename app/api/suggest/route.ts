import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/anthropic';
import { SUGGEST_SYSTEM_PROMPT } from '@/lib/prompts';
import { SuggestSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = SuggestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { title, description } = parsed.data;
  const userMessage = `Title: ${title}\n\nDescription: ${description}`;

  try {
    const raw = await chat(userMessage, SUGGEST_SYSTEM_PROMPT);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const result = JSON.parse(jsonMatch[0]) as { moodTags: string[]; useCases: string[] };
    return NextResponse.json({ moodTags: result.moodTags ?? [], useCases: result.useCases ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
