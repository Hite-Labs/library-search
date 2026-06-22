// Memberstack 2.0 DOM (browser) wrapper — runs ONLY in the browser (holds the public
// key, never the secret). Used to send the "set your password" email when Lindsay
// creates a client, since the Admin API has no email-sending endpoint. Mirrors the
// lazy-singleton pattern of lib/memberstack.ts, but client-side.
import memberstackDOM from '@memberstack/dom';

type DomClient = ReturnType<typeof memberstackDOM.init>;

// NEXT_PUBLIC_ vars are inlined into the client bundle at build time.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_MEMBERSTACK_PUBLIC_KEY;

/** True when a Memberstack public key is configured (and we're in the browser). */
export function isMemberstackDomConfigured(): boolean {
  return typeof window !== 'undefined' && Boolean(PUBLIC_KEY);
}

let _dom: DomClient | null = null;
function getClient(): DomClient | null {
  if (typeof window === 'undefined' || !PUBLIC_KEY) return null;
  if (!_dom) _dom = memberstackDOM.init({ publicKey: PUBLIC_KEY });
  return _dom;
}

/**
 * Send a Memberstack "reset / set your password" email to a (just-provisioned) member.
 * This is the onboarding email: a new client uses the link to set their own password.
 *
 * Memberstack's reset endpoint is privacy-safe — it resolves the same whether or not the
 * email is a real member (no enumeration), so a successful resolve simply means "request
 * accepted". We only treat a genuine init/network failure as an error. Throws on those so
 * the caller can surface a non-blocking warning; never blocks client creation.
 */
export async function sendWelcomeResetEmail(email: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Memberstack DOM is not configured (NEXT_PUBLIC_MEMBERSTACK_PUBLIC_KEY unset)');
  await client.sendMemberResetPasswordEmail({ email });
}
