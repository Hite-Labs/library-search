import { after, NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { secretMatches } from '@/lib/secret';
import { IntakeWebhookSchema } from '@/lib/schemas';
import { findEventForContact, insertEventWithSteps, insertInvalidEvent } from '@/lib/intake/store';
import { runPendingSteps } from '@/lib/intake/runner';
import { notifyLindsay } from '@/lib/notify';

export const runtime = 'nodejs';
// The setup steps run in after(), past the response. Give them room.
export const maxDuration = 300;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/intake — GHL's "new coaching client" webhook (CC-1).
 *
 * PUBLIC: GHL has no dashboard cookie, so this is deliberately absent from proxy.ts and is
 * gated by the X-Intake-Secret header instead.
 *
 * It records the event and answers 200 straight away; the setup itself runs afterwards (see
 * lib/intake/runner.ts). GHL retries slow responses, so doing the work inline would invite
 * duplicate deliveries — which the dedupe would absorb, but there's no reason to provoke it.
 *
 * Always 200 for anything authenticated, even a duplicate or an unusable payload: a non-2xx
 * makes GHL retry, and retrying a bad payload can't fix it. Problems surface on /attention
 * and as a Telegram ping instead.
 */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get('x-intake-secret'), env.INTAKE_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = IntakeWebhookSchema.safeParse(raw);
  const fields = {
    ghlContactId: typeof raw?.ghl_contact_id === 'string' ? raw.ghl_contact_id.slice(0, 100) : null,
    email: typeof raw?.email === 'string' ? raw.email.trim().toLowerCase().slice(0, 200) : null,
    firstName: typeof raw?.first_name === 'string' ? raw.first_name.trim().slice(0, 100) : '',
    lastName: typeof raw?.last_name === 'string' ? raw.last_name.trim().slice(0, 100) : '',
  };

  const problem = !parsed.success
    ? parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
    : !EMAIL.test(parsed.data.email)
      ? 'missing or invalid email'
      : null;

  if (problem || !parsed.success) {
    const id = await insertInvalidEvent({ ...fields, payload: raw ?? {}, error: problem ?? 'invalid' });
    const who = [fields.firstName, fields.lastName].filter(Boolean).join(' ') || 'someone';
    await notifyLindsay(`Intake from ${who} couldn't be processed: ${problem}. Check it in GHL.`, `/attention#${id}`);
    return NextResponse.json({ ok: true, status: 'invalid', id });
  }

  const data = parsed.data;
  const id = await insertEventWithSteps({
    ghlContactId: data.ghl_contact_id,
    email: data.email.toLowerCase(),
    firstName: data.first_name,
    lastName: data.last_name,
    payload: raw,
  });

  if (!id) {
    // This contact already has an intake. Within the day it's GHL retrying or a double
    // submit — ignore it quietly. Later than that it's probably a returning client (a new
    // pack, a second go at the form), which setup won't redo on its own, so tell Lindsay
    // rather than dropping it where nobody would notice.
    const existing = await findEventForContact(data.ghl_contact_id);
    const ageMs = existing ? Date.now() - new Date(existing.created_at).getTime() : 0;
    if (existing && ageMs > 24 * 60 * 60 * 1000) {
      const who = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email;
      const when = new Date(existing.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
      });
      await notifyLindsay(
        `${who} submitted the intake form again. They were already set up on ${when}, so ` +
          `nothing was re-run — if they're starting a new pack, add it on their client page.`,
        existing.client_id ? `/clients/${existing.client_id}` : `/attention#${existing.id}`,
      );
    }
    return NextResponse.json({ ok: true, status: 'duplicate' });
  }

  after(() => runPendingSteps());
  return NextResponse.json({ ok: true, status: 'received', id });
}
