import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, setAuthCookie } from '@/lib/auth';
import {
  isLockedOut,
  recordFailure,
  clearFailures,
  getClientIp,
  attemptsRemaining,
} from '@/lib/rate-limit';
import { LoginSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const lockout = isLockedOut(ip);
  if (lockout.locked) {
    return NextResponse.json(
      { error: 'locked', retryAfterSeconds: lockout.retryAfterSeconds },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const valid = verifyPassword(parsed.data.password);
  if (!valid) {
    recordFailure(ip);
    const newLockout = isLockedOut(ip);
    if (newLockout.locked) {
      return NextResponse.json(
        { error: 'locked', retryAfterSeconds: newLockout.retryAfterSeconds },
        { status: 429 },
      );
    }
    // Tell the operator how many tries are left. This leaks nothing an attacker can't
    // learn by counting their own requests, and it's the difference between "wrong
    // password" and an unexplained lockout on the next keystroke.
    return NextResponse.json(
      { error: 'invalid', attemptsRemaining: attemptsRemaining(ip) },
      { status: 401 },
    );
  }

  clearFailures(ip);
  await setAuthCookie();
  return NextResponse.json({ ok: true });
}
