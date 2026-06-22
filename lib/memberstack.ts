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

/**
 * Ensure a Memberstack member exists for this email. Dedupes first (so re-adding an
 * existing client links rather than duplicates). Returns the mem_… id and whether it
 * was newly created. On create, fills the member's name (customFields), stashes the
 * coaching goal + session count (metaData, backend-only), and attaches the individual
 * free plan when MEMBERSTACK_INDIVIDUAL_PLAN_ID is set.
 */
export async function provisionMember({
  email,
  firstName,
  lastName,
  goal,
  totalSessions,
}: {
  email: string;
  firstName?: string;
  lastName?: string;
  goal?: string;
  totalSessions?: number;
}): Promise<{ id: string; created: boolean }> {
  const client = getClient();
  if (!client) throw new Error('Memberstack is not configured (MEMBERSTACK_SECRET_KEY unset)');

  const existing = await findMemberByEmail(email);
  if (existing) return { id: existing.id, created: false };

  // Memberstack's default name custom fields are kebab-case keys (first-name/last-name).
  const customFields: Record<string, string> = {};
  if (firstName) customFields['first-name'] = firstName;
  if (lastName) customFields['last-name'] = lastName;

  // App-private data Lindsay tracks — backend-only metadata, not shown in the member UI.
  const metaData: Record<string, unknown> = {};
  if (goal) metaData.coachingGoal = goal;
  if (typeof totalSessions === 'number') metaData.totalSessions = totalSessions;

  const planId = env.MEMBERSTACK_INDIVIDUAL_PLAN_ID;

  const res = await client.members.create({
    email,
    password: generatePassword(),
    ...(Object.keys(customFields).length ? { customFields } : {}),
    ...(Object.keys(metaData).length ? { metaData } : {}),
    ...(planId ? { plans: [{ planId }] } : {}),
  });
  const id = res?.data?.id;
  if (!id) throw new Error('Memberstack create returned no member id');
  return { id, created: true };
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
