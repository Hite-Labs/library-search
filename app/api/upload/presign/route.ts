import { NextRequest, NextResponse } from 'next/server';
import { getR2Key, getPublicUrl, getPresignedPutUrl } from '@/lib/r2';
import { PresignSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PresignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { filename, contentType, mediaType } = parsed.data;
  const r2Key = getR2Key(filename, mediaType);
  const publicUrl = getPublicUrl(r2Key);
  const uploadUrl = await getPresignedPutUrl(r2Key, contentType);

  return NextResponse.json({ uploadUrl, publicUrl, r2Key });
}
