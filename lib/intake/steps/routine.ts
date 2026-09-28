import { getClientById } from '../../db';
import { env } from '../../env';
import { docUrl, folderUrl } from '../../google';
import { fireRoutine, isRoutineConfigured, RoutineError } from '../../routine';
import { getSpaceForClient } from '../../telegram-spaces';
import { PermanentError, TransientError } from '../errors';
import { routineAlreadyFiredForClient } from '../store';
import type { StepHandler } from '../runner';
import { ghlContactUrl } from './drive';

/** Result key marking that a fire was sent and its outcome isn't known yet. */
export const FIRE_IN_FLIGHT_KEY = 'fireStartedAt';

/**
 * CC-6 — fire the drafting routine once setup is done.
 *
 * The fire endpoint has no idempotency key, so a blind retry could draft (and later, a
 * person could send) two intro emails. Therefore:
 *   - Only 429 and 503 are retried automatically: the request was refused, nothing ran.
 *   - Anything else — including a timeout, where the routine may well have started — fails
 *     for Lindsay to check and retry by hand.
 *   - Before sending, the step checkpoints `fireStartedAt`. If the process dies mid-request
 *     and the step is picked up again, that marker stops a second fire. The manual Retry on
 *     /attention clears it, which is the "I checked, it didn't run" override.
 *
 * With the routine unset the step completes as skipped, so the rest of intake can ship
 * before the routine exists.
 */
export const routineStep: StepHandler = async ({ event, prior, step, save }) => {
  if (step.result.sessionUrl) return step.result;
  if (!isRoutineConfigured()) return { skipped: true };

  if (step.result[FIRE_IN_FLIGHT_KEY]) {
    throw new PermanentError(
      'A previous fire may have gone through (the process stopped mid-request). Check the ' +
        "routine's recent runs; if there's no draft for this client, press Retry.",
    );
  }

  const clientId = prior.client?.clientId as string | undefined;
  const client = clientId ? await getClientById(clientId) : null;
  if (!client) throw new PermanentError('Client step has no client — retry the Member step first');
  if (await routineAlreadyFiredForClient(client.id, event.id)) {
    return { skipped: true, reason: 'Already drafted for this client by an earlier intake' };
  }
  const space = await getSpaceForClient(client.id);

  const name = [event.first_name, event.last_name].filter(Boolean).join(' ') || client.name;
  const loginBase = env.NEXT_PUBLIC_PORTAL_LOGIN_URL;
  const lines = [
    'Type: new_coaching_client',
    `Name: ${name}`,
    `First name: ${event.first_name}`,
    `Email: ${client.email}`,
    `GHL contact (full intake answers): ${ghlContactUrl(event.ghl_contact_id) ?? 'not available'}`,
    `Drive folder: ${client.drive_folder_id ? folderUrl(client.drive_folder_id) : 'not created'}`,
    `Notes doc: ${client.notes_doc_id ? docUrl(client.notes_doc_id) : 'not created'}`,
    `Portal login link: ${loginBase ? `${loginBase}?email=${encodeURIComponent(client.email)}` : 'not configured'}`,
    `Telegram invite link: ${space?.invite_link ?? 'not assigned'}`,
  ];

  await save({ [FIRE_IN_FLIGHT_KEY]: new Date().toISOString() });

  try {
    const { sessionUrl } = await fireRoutine(lines.join('\n'));
    return { sessionUrl, firedAt: new Date().toISOString(), [FIRE_IN_FLIGHT_KEY]: null };
  } catch (err) {
    if (err instanceof RoutineError && (err.status === 429 || err.status === 503)) {
      // Refused outright, so nothing ran: safe to clear the marker and let the runner retry.
      await save({ [FIRE_IN_FLIGHT_KEY]: null });
      throw new TransientError(
        err.message,
        err.retryAfterMs !== undefined ? new Date(Date.now() + err.retryAfterMs) : undefined,
      );
    }
    if (err instanceof RoutineError && err.status >= 400 && err.status < 500) {
      // A definite rejection (bad token, bad id): nothing ran either, so clear the marker —
      // but it needs a person, so no automatic retry.
      await save({ [FIRE_IN_FLIGHT_KEY]: null });
    }
    throw new PermanentError(err instanceof Error ? err.message : String(err));
  }
};
