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
 * was newly created.
 */
export async function provisionMember({ email }: { email: string }): Promise<{ id: string; created: boolean }> {
  const client = getClient();
  if (!client) throw new Error('Memberstack is not configured (MEMBERSTACK_SECRET_KEY unset)');

  const existing = await findMemberByEmail(email);
  if (existing) return { id: existing.id, created: false };

  const res = await client.members.create({ email, password: generatePassword() });
  const id = res?.data?.id;
  if (!id) throw new Error('Memberstack create returned no member id');
  return { id, created: true };
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
