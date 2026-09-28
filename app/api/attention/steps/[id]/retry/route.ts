import { after, NextResponse } from 'next/server';
import { getStep, refreshEventStatus, resetStep } from '@/lib/intake/store';
import { runPendingSteps } from '@/lib/intake/runner';
import { FIRE_IN_FLIGHT_KEY } from '@/lib/intake/steps/routine';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/attention/steps/[id]/retry — Lindsay's Retry button (CC-2, CC-9).
 *
 * Only a failed or blocked step can be retried; the handler's own idempotency decides what
 * actually gets redone. For the routine step this also clears the "a fire may be in flight"
 * marker — pressing Retry there means "I checked, no draft was made".
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const step = await getStep(id);
  if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

  const reset = await resetStep(id, step.step === 'routine' ? [FIRE_IN_FLIGHT_KEY] : []);
  if (!reset) {
    return NextResponse.json(
      { error: `Only a failed or blocked step can be retried (this one is ${step.status})` },
      { status: 409 },
    );
  }
  await refreshEventStatus(step.event_id);
  after(() => runPendingSteps());
  return NextResponse.json({ ok: true });
}
