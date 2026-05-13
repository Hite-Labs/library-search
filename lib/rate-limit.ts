interface LockoutEntry {
  count: number;
  lockedUntil: number | null;
}

const store = new Map<string, LockoutEntry>();

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

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
