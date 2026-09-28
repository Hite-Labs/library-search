import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time check of a shared-secret header (the intake webhook, the cron tick).
 *
 * Both sides are hashed first so the comparison is always over equal-length buffers —
 * timingSafeEqual throws on a length mismatch, and an early length check would itself leak
 * the secret's length. An unset expected secret never matches, so a missing env var locks
 * the route rather than opening it.
 */
export function secretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
