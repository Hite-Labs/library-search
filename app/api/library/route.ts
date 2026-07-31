import { NextResponse } from 'next/server';
import { listLibraryItems } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/library — every public-library content item, newest first.
 *
 * No presigning here, unlike /api/clients/[id]: public-library rows carry a
 * genuinely public R2 url that is already published on the Webflow content pages,
 * so signing each one would add a presign round-trip per row and an expiry, for no
 * security benefit.
 *
 * Cookie-protected by proxy.ts (both the '/api/library' and '/api/library/:path*'
 * matcher entries are required — without the bare one this route is public).
 */
export async function GET() {
  const items = await listLibraryItems();
  return NextResponse.json({ items });
}
