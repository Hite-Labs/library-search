import { createClientWithEnrollment } from '../../db';
import { env } from '../../env';
import { isMemberstackConfigured, planIdFor } from '../../memberstack';
import { notConfigured, TransientError } from '../errors';
import { setEventClient } from '../store';
import type { StepHandler } from '../runner';

/**
 * CC-3 — match-or-create the client and their Memberstack member.
 *
 * Goes through `createClientWithEnrollment`, the same service the dashboard's "New client"
 * form uses, so there is one way a coaching client comes into existence. That service is
 * already idempotent in every way this needs:
 *   - the client is found by email (case-insensitive) before one is created,
 *   - `reuseActiveEnrollment` returns their existing active pack instead of adding another,
 *   - provisioning finds the Memberstack member by email before creating one, and only
 *     attaches the individual plan if they don't already hold it.
 * So this step simply runs it again on retry — including after a partial failure — and a
 * 21-Day Challenge buyer ends up as one member holding both plans.
 */
export const clientStep: StepHandler = async ({ event }) => {
  if (!isMemberstackConfigured()) throw notConfigured('MEMBERSTACK_SECRET_KEY');
  // Without the plan id the member is created but gets no coaching plan, and the portal
  // shows them the upsell — worse than waiting, so stop here until it's set.
  if (!planIdFor('individual')) throw notConfigured('MEMBERSTACK_INDIVIDUAL_PLAN_ID');

  const out = await createClientWithEnrollment({
    firstName: event.first_name,
    lastName: event.last_name,
    email: event.email ?? '',
    goal: '',
    totalSessions: env.INTAKE_DEFAULT_SESSIONS ?? 6,
    programType: 'individual',
    reuseActiveEnrollment: true,
  });
  await setEventClient(event.id, out.client.id);

  // The service never throws on a Memberstack problem — it saves the client and reports a
  // warning, which suits a person at a form. Here nobody is watching, so a warning is a
  // failure to retry; the re-run skips everything that already succeeded.
  if (out.provisionWarning) throw new TransientError(out.provisionWarning);

  return {
    clientId: out.client.id,
    memberstackId: out.client.memberstack_id,
    enrollmentId: out.enrollment?.id ?? null,
    reusedClient: out.reusedClient,
    memberCreated: out.memberProvisioned,
    plansAttached: out.plansAttached,
  };
};
