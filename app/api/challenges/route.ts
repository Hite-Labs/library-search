import { NextRequest, NextResponse } from 'next/server';
import { listChallenges, createChallenge } from '@/lib/db';
import { CreateChallengeSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/challenges — all runs, optionally filtered by status.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const challenges = await listChallenges(status);
  return NextResponse.json({ challenges });
}

// POST /api/challenges — create a run. It starts as a draft; making it 'active' is a
// separate deliberate step, so a half-configured run is never live.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const challenge = await createChallenge(parsed.data);
  return NextResponse.json({ ok: true, challenge });
}
