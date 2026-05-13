import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'upload_session';

async function verifyToken(token: string, secret: string): Promise<boolean> {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedApi =
    pathname.startsWith('/api/upload/') || pathname === '/api/suggest';

  if (!isProtectedApi) return NextResponse.next();

  const secret = process.env.SESSION_SECRET ?? '';
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token || !(await verifyToken(token, secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/upload/:path*', '/api/suggest'],
};
