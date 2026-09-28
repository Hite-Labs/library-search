import { NextResponse } from 'next/server';
import { listAttentionEvents } from '@/lib/intake/store';
import { listOpenCustomAudios } from '@/lib/custom-audios';
import { countAvailableSpaces, listSpaces, LOW_POOL_THRESHOLD } from '@/lib/telegram-spaces';

export const runtime = 'nodejs';

/**
 * GET /api/attention — everything the Needs attention page shows (CC-9): recent intakes with
 * their step checklists, the Telegram pool, and custom audios still in progress.
 */
export async function GET() {
  const [events, audios, available, spaces] = await Promise.all([
    listAttentionEvents(),
    listOpenCustomAudios(),
    countAvailableSpaces(),
    listSpaces(),
  ]);
  return NextResponse.json({
    events,
    openAudios: audios,
    pool: { available, total: spaces.length, lowThreshold: LOW_POOL_THRESHOLD, spaces },
  });
}
