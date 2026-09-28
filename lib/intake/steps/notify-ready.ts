import { notifyLindsay } from '../../notify';
import type { StepHandler } from '../runner';

/** CC-7 — the one "new client is ready" ping, sent once every setup step has finished. */
export const notifyReadyStep: StepHandler = async ({ event, step, prior }) => {
  if (step.result.sentAt) return step.result;

  const who = [event.first_name, event.last_name].filter(Boolean).join(' ') || event.email;
  const drafted = prior.routine?.reason
    ? `No new drafts: ${String(prior.routine.reason).toLowerCase()}.`
    : prior.routine?.skipped
      ? 'No drafts (routine not configured).'
      : 'Intro email draft is in Gmail.';
  const clientId = prior.client?.clientId as string | undefined;

  await notifyLindsay(
    `New coaching client ready: ${who}. Member, Drive folder and Telegram are set up. ${drafted}`,
    clientId ? `/clients/${clientId}` : `/attention#${event.id}`,
  );
  return { sentAt: new Date().toISOString() };
};
