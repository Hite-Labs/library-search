interface LockoutEntry {
  count: number;
  lockedUntil: number | null;
}

const store = new Map<string, LockoutEntry>();

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Extract the caller's IP for rate-limit keying.
 *
 * Prefers `X-Real-IP`, which nginx sets from `$remote_addr` (DEPLOY.md:70) — the socket peer,
 * which a client cannot forge.
 *
 * `X-Forwarded-For` is only a fallback, and we read its LAST hop, not its first. nginx uses
 * `$proxy_add_x_forwarded_for` (DEPLOY.md:71), which APPENDS the real address to whatever the
 * client sent. Reading hop 0 therefore reads attacker-controlled input: sending
 * `X-Forwarded-For: <random>` would mint a fresh rate-limit bucket per request and bypass the
 * budget entirely on a route that spends Voyage + Anthropic credits. The last hop is the one
 * nginx appended.
 *
 * Falls back to 'unknown', which buckets every unattributable caller together — deliberate:
 * a request we can't attribute shouldn't get its own fresh quota.
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const hops = req.headers.get('x-forwarded-for')?.split(',') ?? [];
  const lastHop = hops[hops.length - 1]?.trim();
  return lastHop || 'unknown';
}

export function isLockedOut(ip: string): { locked: boolean; retryAfterSeconds: number } {
  const entry = store.get(ip);
  if (!entry || entry.lockedUntil === null) return { locked: false, retryAfterSeconds: 0 };

  if (Date.now() < entry.lockedUntil) {
    const retryAfterSeconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return { locked: true, retryAfterSeconds };
  }

  store.delete(ip);
  return { locked: false, retryAfterSeconds: 0 };
}

export function recordFailure(ip: string): void {
  const entry = store.get(ip) ?? { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  store.set(ip, entry);
}

export function clearFailures(ip: string): void {
  store.delete(ip);
}

// ---------------------------------------------------------------------------
// Sliding-window throughput limiter
//
// Distinct from the lockout above, which counts FAILURES and bans for an hour — right for
// a password prompt, wrong for a search box (three searches would earn an hour's ban).
// This counts SUCCESSFUL requests inside a rolling window and throttles only while the
// caller is over budget.
//
// Both share the same in-process-Map shape, and the same limitation: state lives in one
// Node process, so the budget is per-PM2-instance and resets on reload. That stops casual
// abuse and runaway scripts, not a determined attacker spreading across IPs. Moving to a
// shared store (Neon table / Redis) is a separate decision — see the roadmap.
// ---------------------------------------------------------------------------

/** Request timestamps (ms) per key, oldest first. Pruned on read. */
const windows = new Map<string, number[]>();

/**
 * Sweep threshold. Without this, keys that are never queried again leak: a one-off caller
 * leaves an entry behind forever. Cheap to run since it only fires on growth.
 */
const MAX_TRACKED_KEYS = 10_000;

/** Max entries examined per sweep, so cleanup can't become O(map) work per request. */
const SWEEP_BUDGET = 500;

/**
 * Check and record one request against a rolling window.
 *
 * Calling this COUNTS the request, so call it once per request and only where you intend
 * the request to be charged — for /api/search that means before the paid Voyage/Anthropic
 * calls, so a throttled request costs nothing.
 *
 * @param key       bucket identity (an IP from getClientIp, or a member id)
 * @param limit     max requests allowed per window
 * @param windowMs  window length in ms
 */
export function checkRate(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Sweep keys whose windows have fully expired. `times` is append-ordered, so the last
  // element is the newest hit; if even that has aged out, the whole window is dead.
  //
  // Two guards matter here. First, the scan is bounded: at 10k SIMULTANEOUSLY ACTIVE keys
  // nothing is expired, so an unbounded sweep would walk the whole map on every request,
  // free nothing, and keep growing — turning the limiter into a CPU amplifier on the very
  // route it protects. Second, when a bounded sweep can't reclaim anything we stop tracking
  // new keys rather than grow without limit; existing keys keep being enforced, and a new
  // caller is allowed through. Failing open on an overloaded limiter is the right trade for
  // a public search box, and the ceiling is high enough that reaching it means a
  // distributed burst, which a per-process in-memory limiter can't answer anyway.
  if (windows.size > MAX_TRACKED_KEYS) {
    let scanned = 0;
    let freed = 0;
    for (const [k, times] of windows) {
      if (times.length === 0 || times[times.length - 1] < cutoff) {
        windows.delete(k);
        freed++;
      }
      if (++scanned >= SWEEP_BUDGET) break;
    }
    if (freed === 0 && !windows.has(key)) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  const hits = (windows.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    // Oldest hit in the window is what has to age out before a slot frees up.
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    windows.set(key, hits);
    return { allowed: false, retryAfterSeconds };
  }

  hits.push(now);
  windows.set(key, hits);
  return { allowed: true, retryAfterSeconds: 0 };
}
