// Memberstack 2.0 Admin API wrapper (server-side only — holds the secret key).
// Follows the lazy-singleton pattern used by lib/anthropic.ts and lib/r2.ts.
import memberstackAdmin from '@memberstack/admin';
import { randomBytes } from 'node:crypto';
import { env } from './env';

type AdminClient = ReturnType<typeof memberstackAdmin.init>;

/** True when a Memberstack secret key is configured. */
export function isMemberstackConfigured(): boolean {
  return Boolean(env.MEMBERSTACK_SECRET_KEY);
}

let _ms: AdminClient | null = null;
// Returns the Admin client, or null when MEMBERSTACK_SECRET_KEY isn't set. Callers
// must handle null so the app stays up without the key (provisioning warns, token
// verify falls back to anonymous) instead of crashing at import/boot time.
function getClient(): AdminClient | null {
  if (!env.MEMBERSTACK_SECRET_KEY) return null;
  if (!_ms) _ms = memberstackAdmin.init(env.MEMBERSTACK_SECRET_KEY);
  return _ms;
}

// A Memberstack member is created with a password even when the app uses passwordless
// login (the Admin API requires one). We never surface it — members log in via the
// Memberstack portal (passwordless OTP or a reset), so this is just a strong throwaway.
function generatePassword(): string {
  return `Ms-${randomBytes(24).toString('base64url')}`;
}

/** Look up a member by email. Returns null if none exists (404), throws on real errors. */
export async function findMemberByEmail(email: string): Promise<{ id: string } | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const res = await client.members.retrieve({ email });
    return res?.data?.id ? { id: res.data.id } : null;
  } catch (err) {
    // retrieve() throws on a 404 (no such member) — treat that as "not found".
    const msg = String(err);
    if (/404|not found/i.test(msg)) return null;
    throw err;
  }
}

/** Which portal panel(s) this member should be entitled to. */
export type PlanType = 'individual' | 'cohort' | 'both';

/**
 * Ensure a Memberstack member exists for this email. Dedupes first (so re-adding an
 * existing client links rather than duplicates). Returns the mem_… id and whether it
 * was newly created. On create, fills the member's name (customFields), stashes the
 * coaching goal + session count (metaData, backend-only), and attaches the free plan(s)
 * matching `planType`.
 *
 * The plan matters: public/portal.js decides which panel to show from the member's
 * planConnections, so a cohort member given the individual plan would land on an
 * individual panel with no data, and one given no plan sees only the upsell.
 *
 * Plan ids come from MEMBERSTACK_INDIVIDUAL_PLAN_ID / MEMBERSTACK_COHORT_PLAN_ID; either
 * being unset simply omits that plan (provisioning still succeeds) — but the omission is
 * reported back as `plansSkipped` so the caller can warn. A member created without the
 * plan their program needs can log in and still see nothing, which looks identical to a
 * broken account from the admin's side; failing silently there is what makes it hard to
 * diagnose.
 */
export async function provisionMember({
  email,
  firstName,
  lastName,
  goal,
  totalSessions,
  planType = 'individual',
}: {
  email: string;
  firstName?: string;
  lastName?: string;
  goal?: string;
  totalSessions?: number;
  planType?: PlanType;
}): Promise<{
  id: string;
  created: boolean;
  /** Plans this planType called for whose env id is unset, so nothing was attached. */
  plansSkipped: ('individual' | 'cohort')[];
}> {
  const client = getClient();
  if (!client) throw new Error('Memberstack is not configured (MEMBERSTACK_SECRET_KEY unset)');

  // 'both' attaches both plans, which is what lets the portal show its plan-tab header.
  const wantsIndividual = planType === 'individual' || planType === 'both';
  const wantsCohort = planType === 'cohort' || planType === 'both';

  // Worked out before the dedupe check so the caller is warned about an unset plan id
  // either way — the misconfiguration is just as real for a member we're reusing.
  const plansSkipped: ('individual' | 'cohort')[] = [];
  if (wantsIndividual && !env.MEMBERSTACK_INDIVIDUAL_PLAN_ID) plansSkipped.push('individual');
  if (wantsCohort && !env.MEMBERSTACK_COHORT_PLAN_ID) plansSkipped.push('cohort');

  const existing = await findMemberByEmail(email);
  if (existing) return { id: existing.id, created: false, plansSkipped };

  // Memberstack's default name custom fields are kebab-case keys (first-name/last-name).
  const customFields: Record<string, string> = {};
  if (firstName) customFields['first-name'] = firstName;
  if (lastName) customFields['last-name'] = lastName;

  // App-private data Lindsay tracks — backend-only metadata, not shown in the member UI.
  const metaData: Record<string, unknown> = {};
  if (goal) metaData.coachingGoal = goal;
  if (typeof totalSessions === 'number') metaData.totalSessions = totalSessions;

  const planIds = [
    wantsIndividual ? env.MEMBERSTACK_INDIVIDUAL_PLAN_ID : undefined,
    wantsCohort ? env.MEMBERSTACK_COHORT_PLAN_ID : undefined,
  ].filter((id): id is string => Boolean(id));

  const res = await client.members.create({
    email,
    password: generatePassword(),
    ...(Object.keys(customFields).length ? { customFields } : {}),
    ...(Object.keys(metaData).length ? { metaData } : {}),
    ...(planIds.length ? { plans: planIds.map((planId) => ({ planId })) } : {}),
  });
  const id = res?.data?.id;
  if (!id) throw new Error('Memberstack create returned no member id');
  return { id, created: true, plansSkipped };
}

/**
 * Merge fields into a member's metaData (backend-only data: coaching goal, totalSessions,
 * and future values like membershipExpiresAt / lastSessionAt that drive offers/visibility).
 * Memberstack replaces the whole metaData object on update, so we read the current value
 * first and merge — updating one field never clobbers the others. Pass null as a value to
 * remove a key. No-ops (returns false) when Memberstack isn't configured.
 */
export async function updateMemberMetaData(
  memberstackId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const current = await client.members.retrieve({ id: memberstackId });
  const existing = (current?.data?.metaData as Record<string, unknown>) ?? {};
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  await client.members.update({ id: memberstackId, data: { metaData: merged } });
  return true;
}

/** A Memberstack member reduced to what reconciliation cares about. */
export interface MemberPlanState {
  id: string;
  email: string;
  /** Active connections only — a cancelled/expired plan grants no portal access. */
  hasIndividualPlan: boolean;
  hasCohortPlan: boolean;
}

/**
 * Every Memberstack member with their active plan state, for reconciling against the
 * dashboard's enrollments. Pages through the Admin API (100 at a time) until exhausted.
 *
 * Returns null when Memberstack isn't configured, so callers can show "unavailable"
 * rather than an empty list — an empty list would falsely read as "no members exist",
 * which in a reconciliation view means "delete everything".
 *
 * A plan connection counts only when `active` is true AND its status isn't a terminal
 * one: Memberstack keeps cancelled connections on the member, and treating those as
 * live access would hide real drift.
 */
export async function listMembersWithPlans(): Promise<MemberPlanState[] | null> {
  const client = getClient();
  if (!client) return null;

  const individualId = env.MEMBERSTACK_INDIVIDUAL_PLAN_ID;
  const cohortId = env.MEMBERSTACK_COHORT_PLAN_ID;

  const out: MemberPlanState[] = [];
  let after: number | undefined = undefined;

  // Bounded loop: 200 pages × 100 = 20k members, far beyond this use case, but it
  // guarantees termination if the cursor ever fails to advance.
  for (let page = 0; page < 200; page++) {
    const res = await client.members.list({ limit: 100, ...(after ? { after } : {}) });
    const members = res?.data ?? [];

    for (const m of members) {
      const conns = Array.isArray(m.planConnections) ? m.planConnections : [];
      const activePlanIds = new Set(
        conns
          .filter((c): c is Exclude<typeof c, string> => typeof c !== 'string')
          .filter((c) => c.active && !/cancel|expired/i.test(c.status ?? ''))
          .map((c) => c.planId),
      );
      out.push({
        id: m.id,
        email: m.auth?.email ?? '',
        hasIndividualPlan: individualId ? activePlanIds.has(individualId) : false,
        hasCohortPlan: cohortId ? activePlanIds.has(cohortId) : false,
      });
    }

    if (!res?.hasNextPage || members.length === 0) break;
    after = res.endCursor;
  }

  return out;
}

/**
 * The active plan state of ONE member, for callers that need to know what a member
 * already holds before changing it (see `ensureMemberProvisioned`). `listMembersWithPlans`
 * answers the same question for the whole account, but paging every member to look up one
 * person is the wrong shape on an enrollment write.
 *
 * Returns null when Memberstack isn't configured or the member can't be read — callers
 * must treat null as "unknown", never as "holds nothing", since acting on the latter
 * would attach plans blindly.
 *
 * Mirrors the connection filter in `listMembersWithPlans`: a connection counts only when
 * `active` and not in a terminal status, so a cancelled plan reads as absent in both.
 */
export async function getMemberPlanState(
  memberstackId: string,
): Promise<{ hasIndividualPlan: boolean; hasCohortPlan: boolean } | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const res = await client.members.retrieve({ id: memberstackId });
    const conns = Array.isArray(res?.data?.planConnections) ? res.data.planConnections : [];
    const activePlanIds = new Set(
      conns
        .filter((c): c is Exclude<typeof c, string> => typeof c !== 'string')
        .filter((c) => c.active && !/cancel|expired/i.test(c.status ?? ''))
        .map((c) => c.planId),
    );
    const individualId = env.MEMBERSTACK_INDIVIDUAL_PLAN_ID;
    const cohortId = env.MEMBERSTACK_COHORT_PLAN_ID;
    return {
      hasIndividualPlan: individualId ? activePlanIds.has(individualId) : false,
      hasCohortPlan: cohortId ? activePlanIds.has(cohortId) : false,
    };
  } catch {
    return null;
  }
}

/**
 * Attach or detach one of the two coaching plans on a member. Used by the reconciliation
 * view to fix drift in either direction. Returns false when Memberstack isn't configured
 * or the plan id for that type isn't set.
 */
export async function setMemberPlan(
  memberstackId: string,
  planType: 'individual' | 'cohort',
  attached: boolean,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const planId =
    planType === 'individual' ? env.MEMBERSTACK_INDIVIDUAL_PLAN_ID : env.MEMBERSTACK_COHORT_PLAN_ID;
  if (!planId) return false;

  if (attached) await client.members.addFreePlan({ id: memberstackId, data: { planId } });
  else await client.members.removeFreePlan({ id: memberstackId, data: { planId } });
  return true;
}

/**
 * Verify a member JWT (from the _ms-mid cookie). Returns the trusted member id, or
 * null for any invalid/expired token — callers should degrade gracefully, never 500.
 */
export async function verifyMemberToken(token: string): Promise<{ id: string } | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const audience = env.NEXT_PUBLIC_MEMBERSTACK_APP_ID || undefined;
    const payload = await client.verifyToken({ token, audience });
    return payload?.id ? { id: payload.id } : null;
  } catch {
    return null;
  }
}
