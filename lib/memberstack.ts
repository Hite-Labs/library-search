// Memberstack 2.0 Admin API wrapper (server-side only — holds the secret key).
// Follows the lazy-singleton pattern used by lib/anthropic.ts and lib/r2.ts.
import memberstackAdmin from '@memberstack/admin';
import { randomBytes } from 'node:crypto';
import { env } from './env';
import { PLAN_KEYS, isPlanKey as isPlanKeyFn, type PlanKey, type PlanFlags } from './plan-keys';

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

// ── Plan registry ────────────────────────────────────────────────────────────
//
// One place that knows which plans exist. Everything else derives from it, so adding a
// plan is an entry here rather than a new boolean threaded through six files.
//
// This replaces a pair of named booleans (hasIndividualPlan / hasCohortPlan) that had to be
// re-encoded at every layer. Two spots already had the right shape — `revoked()` in the
// portal route takes the plan id as an argument, and reconcile's `checks[]` is an array of
// descriptors — so this generalises in the direction the code was already heading.

// The keys themselves live in lib/plan-keys.ts, which has no dependencies, so dashboard
// pages in the browser can read them without pulling this module's Admin SDK and secret
// key into the client bundle. Re-exported here so every existing server-side import of
// PLAN_KEYS / PlanKey / PlanFlags from '@/lib/memberstack' keeps working unchanged.
export { PLAN_KEYS, isPlanKey } from './plan-keys';
export type { PlanKey, PlanFlags } from './plan-keys';

/**
 * The Memberstack plan id configured for each plan, or undefined when its env var is unset.
 *
 * Read through this rather than touching env directly: an unset id means "cannot evaluate
 * this plan", which callers must distinguish from "member doesn't hold it" — conflating the
 * two is what would silently paywall everyone.
 */
/**
 * Every plan id that counts as holding this key.
 *
 * The challenge has two: the paid plan someone buys directly, and a free "challenge
 * included" twin that Memberstack grants automatically with the audio membership. That twin
 * exists because a paid plan cannot be attached by anything but a purchase — `plan-not-free`
 * — so bundling had to be expressed as a second, free plan rather than as an API call.
 *
 * Holding either is access. They are not ranked and nothing distinguishes them downstream:
 * the member is in the challenge, and how they got there is a billing question, not an
 * entitlement one.
 *
 * Every other key has exactly one id, so this collapses to planIdFor for them.
 */
export function planIdsFor(key: PlanKey): string[] {
  const ids = [planIdFor(key)];
  if (key === 'challenge') ids.push(env.MEMBERSTACK_CHALLENGE_INCLUDED_PLAN_ID);
  return ids.filter((id): id is string => Boolean(id));
}

/**
 * The single plan id to WRITE for this key — what attach/detach targets.
 *
 * Deliberately still one id, and deliberately the paid one for the challenge: granting the
 * free twin by hand would hand out a membership perk to someone who has not bought the
 * membership. `isPlanAttachable` refuses the challenge anyway, so this is belt and braces.
 */
export function planIdFor(key: PlanKey): string | undefined {
  switch (key) {
    case 'individual':
      return env.MEMBERSTACK_INDIVIDUAL_PLAN_ID;
    case 'cohort':
      return env.MEMBERSTACK_COHORT_PLAN_ID;
    case 'challenge':
      return env.MEMBERSTACK_CHALLENGE_PLAN_ID;
    case 'membership':
      return env.MEMBERSTACK_MEMBERSHIP_PLAN_ID;
  }
}

/** The env var name backing each plan — used in operator-facing warnings. */
export function planEnvVarFor(key: PlanKey): string {
  switch (key) {
    case 'individual':
      return 'MEMBERSTACK_INDIVIDUAL_PLAN_ID';
    case 'cohort':
      return 'MEMBERSTACK_COHORT_PLAN_ID';
    case 'challenge':
      return 'MEMBERSTACK_CHALLENGE_PLAN_ID';
    case 'membership':
      return 'MEMBERSTACK_MEMBERSHIP_PLAN_ID';
  }
}

/** No plans held — the baseline every flags object starts from. */
export function noPlans(): PlanFlags {
  return PLAN_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {} as PlanFlags);
}

/**
 * Project a set of active Memberstack plan ids onto our plan keys.
 * A plan whose env id is unset reads as false — see the caveat on `planIdFor`.
 */
export function flagsFromPlanIds(activePlanIds: Set<string>): PlanFlags {
  return PLAN_KEYS.reduce((acc, key) => {
    // Any of the key's ids counts — see planIdsFor. A key whose ids are all unset reads as
    // false, which is the caveat on planIdFor: "cannot evaluate" is not "does not hold".
    const ids = planIdsFor(key);
    acc[key] = ids.some((id) => activePlanIds.has(id));
    return acc;
  }, noPlans());
}

/**
 * Which plans an operation applies to.
 *
 * Was a union `'individual' | 'cohort' | 'both'`, where `'both'` sat alongside the plan
 * names — so N plans would have needed 2^N-1 members. A list says the same thing and scales.
 */
export type PlanType = PlanKey[];

/** Does this selection include that plan? */
export function wants(planType: PlanType, key: PlanKey): boolean {
  return planType.includes(key);
}

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
  planType = ['individual'],
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
  plansSkipped: PlanKey[];
}> {
  const client = getClient();
  if (!client) throw new Error('Memberstack is not configured (MEMBERSTACK_SECRET_KEY unset)');

  // Attaching several plans is what lets the portal show its plan-tab header.
  // Worked out before the dedupe check so the caller is warned about an unset plan id
  // either way — the misconfiguration is just as real for a member we're reusing.
  const plansSkipped: PlanKey[] = PLAN_KEYS.filter(
    (key) => wants(planType, key) && !planIdFor(key),
  );

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

  const planIds = PLAN_KEYS.filter((key) => wants(planType, key))
    .map(planIdFor)
    .filter((id): id is string => Boolean(id));

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
  plans: PlanFlags;
}

/**
 * The plan ids a member actively holds.
 *
 * A connection counts only when `active` is true AND its status isn't terminal: Memberstack
 * keeps cancelled connections on the member, and treating those as live access would both
 * hide real drift and let a lapsed member keep paid panels.
 *
 * `planConnections` entries can be a bare id string rather than an object; those carry no
 * status, so they're skipped rather than assumed active.
 */
function activePlanIdsOf(planConnections: unknown): Set<string> {
  const conns = Array.isArray(planConnections) ? planConnections : [];
  return new Set(
    conns
      .filter((c): c is { planId: string; active?: boolean; status?: string } =>
        Boolean(c) && typeof c !== 'string',
      )
      .filter((c) => c.active && !/cancel|expired/i.test(c.status ?? ''))
      .map((c) => c.planId),
  );
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

  const out: MemberPlanState[] = [];
  let after: number | undefined = undefined;

  // Bounded loop: 200 pages × 100 = 20k members, far beyond this use case, but it
  // guarantees termination if the cursor ever fails to advance.
  for (let page = 0; page < 200; page++) {
    const res = await client.members.list({ limit: 100, ...(after ? { after } : {}) });
    const members = res?.data ?? [];

    for (const m of members) {
      out.push({
        id: m.id,
        email: m.auth?.email ?? '',
        plans: flagsFromPlanIds(activePlanIdsOf(m.planConnections)),
      });
    }

    if (!res?.hasNextPage || members.length === 0) break;
    after = res.endCursor;
  }

  return out;
}

// ── Testing: pretend a member holds fewer plans than they do ─────────────────
//
// Every paid plan has to be BOUGHT to be held — addFreePlan refuses them (see
// isPlanAttachable) — so the only account that can exercise the portal end to end is one
// that owns everything. Which is precisely the account that can never see an upsell, an
// empty state, or a locked panel: the states most likely to be broken are the ones the
// tester is least able to reach.
//
// The alternatives are all worse. Detaching a paid plan risks not being able to re-attach
// it without paying again; a second test account needs its own purchases; and editing the
// live plan ids to lie about what exists breaks the real site while the test runs.
//
// So this subtracts at the one place every entitlement decision reads. Set
// PORTAL_PRETEND_PLANS to the plans a member should APPEAR to hold:
//
//   PORTAL_PRETEND_PLANS=mem_abc123:cohort,challenge   → only those two
//   PORTAL_PRETEND_PLANS=mem_abc123:none               → holds nothing (the funnel case)
//   PORTAL_PRETEND_PLANS=                              → off, the normal state
//
// Deliberately subtract-only in spirit but not enforced as such: naming a plan the member
// does not really hold would grant it, so this is a server-side env var an operator sets
// knowingly, never anything a request can influence. It is scoped to ONE member id for the
// same reason — a typo cannot silently re-gate the whole site.
function pretendPlansFor(memberstackId: string): PlanFlags | null {
  const raw = process.env.PORTAL_PRETEND_PLANS;
  if (!raw) return null;

  const sep = raw.indexOf(':');
  if (sep === -1) return null;

  const target = raw.slice(0, sep).trim();
  if (target !== memberstackId) return null;

  const flags = noPlans();
  const listed = raw.slice(sep + 1).trim();
  if (listed && listed !== 'none') {
    for (const key of listed.split(',').map((k) => k.trim())) {
      if (isPlanKeyFn(key)) flags[key] = true;
    }
  }
  console.warn(
    `[memberstack] PORTAL_PRETEND_PLANS active for ${target}: ` +
      `${PLAN_KEYS.filter((k) => flags[k]).join(', ') || 'no plans'}. ` +
      'This is a testing override — unset it in production.',
  );
  return flags;
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
 * Shares `activePlanIdsOf` with `listMembersWithPlans`, so a cancelled plan reads as absent
 * in both — they used to be separate copies of the same filter, which could drift.
 */
export async function getMemberPlanState(memberstackId: string): Promise<PlanFlags | null> {
  const client = getClient();
  if (!client) return null;

  const pretended = pretendPlansFor(memberstackId);
  if (pretended) return pretended;

  try {
    const res = await client.members.retrieve({ id: memberstackId });
    return flagsFromPlanIds(activePlanIdsOf(res?.data?.planConnections));
  } catch {
    return null;
  }
}

/**
 * Attach or detach one plan on a member. Used by the reconciliation view to fix drift in
 * either direction. Returns false when Memberstack isn't configured or the plan id for that
 * key isn't set.
 */
export async function setMemberPlan(
  memberstackId: string,
  planKey: PlanKey,
  attached: boolean,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  // Registry lookup, not a ternary. This was
  //   planType === 'individual' ? INDIVIDUAL_ID : COHORT_ID
  // which has no third branch — any plan key added later would have silently resolved to
  // the COHORT plan id and attached the wrong entitlement, with nothing to catch it.
  const planId = planIdFor(planKey);
  if (!planId) return false;

  if (attached) await client.members.addFreePlan({ id: memberstackId, data: { planId } });
  else await client.members.removeFreePlan({ id: memberstackId, data: { planId } });
  return true;
}

/**
 * Is this plan one the API can attach at all?
 *
 * Memberstack's addFreePlan refuses a paid plan outright — `plan-not-free`, "This plan
 * requires payment" (confirmed against the live account, 2026-09-07). Paid plans arrive
 * only through checkout or a Memberstack automation, never through us.
 *
 * That is not a bug to work around: a paid entitlement granted by an admin button would be
 * access nobody was billed for. But the dashboard should say so before offering the button,
 * rather than letting an operator click and collect a 500.
 *
 * Derived from the env config rather than asked of Memberstack, because the Admin SDK
 * exposes no plans endpoint (there is no `client.plans`). The two paid plans are the two the
 * member buys for themselves — the audio membership and the challenge — which is the same
 * distinction `/reconcile` already draws when it declines to diff them.
 */
const PAID_PLAN_KEYS: readonly PlanKey[] = ['membership', 'challenge'];

export function isPlanAttachable(key: PlanKey): boolean {
  return !PAID_PLAN_KEYS.includes(key);
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
