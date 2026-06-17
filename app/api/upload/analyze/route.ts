import { NextRequest, NextResponse } from 'next/server';
import { transcribe } from '@/lib/transcribe';
import { chat } from '@/lib/anthropic';
import { ANALYZE_SYSTEM_PROMPT } from '@/lib/prompts';
import { AnalyzeSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 300; // transcription polling can take minutes

const MODALITIES = ['Hypnosis', 'EFT', 'Tapping', 'Meditation', 'Other'] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { publicUrl, mediaType } = parsed.data;

  // PDFs have no audio track — nothing to transcribe/analyze. The form falls back to manual entry.
  if (mediaType === 'pdf') {
    return NextResponse.json({ error: 'PDFs are entered manually' }, { status: 400 });
  }

  // Step 1: transcribe
  let transcript: string;
  let durationSeconds: number | null;
  try {
    const result = await transcribe(publicUrl);
    transcript = result.text;
    durationSeconds = result.durationSeconds;
  } catch (err) {
    return NextResponse.json({ ok: false, step: 'transcribe', error: String(err) }, { status: 500 });
  }

  // Step 2: analyze transcript -> metadata
  let description = '';
  let moodTags: string[] = [];
  let useCases: string[] = [];
  let modality = 'Other';

  if (transcript.trim()) {
    try {
      const raw = await chat(`Transcript:\n\n${transcript}`, ANALYZE_SYSTEM_PROMPT);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const result = JSON.parse(jsonMatch[0]) as {
        description?: string;
        moodTags?: string[];
        useCases?: string[];
        modality?: string;
      };
      description = result.description ?? '';
      moodTags = result.moodTags ?? [];
      useCases = result.useCases ?? [];
      // Constrain modality to the allowed set; fall back to "Other".
      modality = MODALITIES.includes(result.modality as (typeof MODALITIES)[number])
        ? (result.modality as string)
        : 'Other';
    } catch (err) {
      return NextResponse.json({ ok: false, step: 'analyze', error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    transcript,
    durationSeconds,
    description,
    moodTags: moodTags.join(', '),
    useCases: useCases.join(', '),
    modality,
  });
}
