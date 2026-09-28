import { notifyLindsay } from '../notify';
import { BlockedError, PermanentError, TransientError } from './errors';
import {
  claimNextStep,
  completeStep,
  getEvent,
  getStepsForEvent,
  mergeStepResult,
  parkStep,
  refreshEventStatus,
  scheduleRetry,
  STEP_LABELS,
  type IntakeEvent,
  type IntakeStep,
  type StepName,
} from './store';
import { clientStep } from './steps/client';
import { driveStep } from './steps/drive';
import { telegramStep } from './steps/telegram';
import { routineStep } from './steps/routine';
import { notifyReadyStep } from './steps/notify-ready';

/**
 * The background runner for intake setup (CC-2).
 *
 * There is no queue service: steps are rows in `intake_steps`, and this drains whatever is
 * due. It is started two ways —
 *   - right after POST /api/intake returns (next/server `after()`), so a new client is set
 *     up within seconds, and
 *   - by the droplet crontab hitting POST /api/jobs/tick once a minute, which picks up
 *     retries whose backoff has elapsed and anything a pm2 restart cut off.
 * Claims are atomic (claimNextStep), so both can run at once without doubling up.
 */

export interface StepContext {
  event: IntakeEvent;
  step: IntakeStep;
  /** Results of this event's earlier steps, keyed by step name. All of them are `done`. */
  prior: Partial<Record<StepName, Record<string, unknown>>>;
  /** Checkpoint part of the result before the step finishes, so a crash after a side effect
   *  (a folder created, a routine fired) isn't repeated on the re-run. */
  save(partial: Record<string, unknown>): Promise<void>;
}

export type StepHandler = (ctx: StepContext) => Promise<Record<string, unknown>>;

const HANDLERS: Record<StepName, StepHandler> = {
  client: clientStep,
  drive: driveStep,
  telegram: telegramStep,
  routine: routineStep,
  notify_ready: notifyReadyStep,
};

export const MAX_ATTEMPTS = 3;
/** Wait before attempt 2 and attempt 3. */
const BACKOFF_MS = [60_000, 5 * 60_000];

// One drain loop per process. A second caller (the tick arriving while an after() drain is
// still going) returns at once; the running loop keeps claiming until nothing is due, so the
// new work isn't lost — at worst it waits for the next tick.
let draining = false;

export async function runPendingSteps(
  opts: { maxSteps?: number; budgetMs?: number } = {},
): Promise<{ ran: number; busy: boolean }> {
  if (draining) return { ran: 0, busy: true };
  draining = true;

  const maxSteps = opts.maxSteps ?? 50;
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  let ran = 0;
  try {
    while (ran < maxSteps && Date.now() < deadline) {
      const step = await claimNextStep();
      if (!step) break;
      ran += 1;
      await runStep(step);
    }
  } catch (err) {
    // A database error while claiming. Nothing is half-done — the claim is one statement — so
    // log it and let the next tick try again.
    console.error('[intake] runner stopped:', err);
  } finally {
    draining = false;
  }
  return { ran, busy: false };
}

async function runStep(step: IntakeStep): Promise<void> {
  const event = await getEvent(step.event_id);
  if (!event) {
    await parkStep(step.id, 'failed', 'Intake event no longer exists');
    return;
  }

  const prior: StepContext['prior'] = {};
  for (const s of await getStepsForEvent(event.id)) {
    if (s.seq < step.seq) prior[s.step] = s.result;
  }

  const ctx: StepContext = {
    event,
    step,
    prior,
    save: async (partial) => {
      Object.assign(step.result, partial);
      await mergeStepResult(step.id, partial);
    },
  };

  try {
    const result = await HANDLERS[step.step](ctx);
    await completeStep(step.id, result);
  } catch (err) {
    await handleFailure(event, step, err);
  }
  await refreshEventStatus(event.id);
}

async function handleFailure(event: IntakeEvent, step: IntakeStep, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const who = [event.first_name, event.last_name].filter(Boolean).join(' ') || event.email || 'intake';
  const label = STEP_LABELS[step.step];
  const link = `/attention#${event.id}`;

  if (err instanceof BlockedError) {
    await parkStep(step.id, 'blocked', message);
    await notifyLindsay(`Setup blocked for ${who}: ${label} — ${message}`, link);
    return;
  }

  if (err instanceof PermanentError || step.attempts >= MAX_ATTEMPTS) {
    await parkStep(step.id, 'failed', message);
    await notifyLindsay(`Setup failed for ${who}: ${label} — ${message}`, link);
    return;
  }

  // TransientError, or anything unclassified (a network error, a 5xx we didn't wrap).
  const retryAt =
    err instanceof TransientError && err.retryAt
      ? err.retryAt
      : new Date(Date.now() + BACKOFF_MS[Math.min(step.attempts - 1, BACKOFF_MS.length - 1)]);
  console.warn(`[intake] ${step.step} for ${event.id} attempt ${step.attempts} failed, retrying:`, message);
  await scheduleRetry(step.id, message, retryAt);
}
