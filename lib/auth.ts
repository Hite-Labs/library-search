import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { env } from './env';

const COOKIE_NAME = 'upload_session';
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

function sign(value: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(value).digest('hex');
}

function makeToken(): string {
  const payload = `authenticated:${Date.now()}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function verifyToken(token: string): boolean {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifyPassword(input: string): boolean {
  const expected = Buffer.from(env.UPLOAD_TOOL_PASSWORD);
  const provided = Buffer.from(input);
  if (expected.length !== provided.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(expected, provided);
}

export async function setAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, makeToken(), {
    httpOnly: true,
    // Only require HTTPS for the cookie when explicitly enabled. Over the bare
    // droplet IP (plain HTTP) a Secure cookie is silently dropped by the browser,
    // breaking login. Set COOKIE_SECURE=true in the env once HTTPS/a domain is live.
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyToken(token);
}
