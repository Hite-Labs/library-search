import { NextResponse } from 'next/server';
import { getLibraryAccessInfo } from '@/lib/library-access';

export const runtime = 'nodejs';

// GET /api/clients/[id]/library-access — when their coaching library access ends (or ended).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const info = await getLibraryAccessInfo(id);
    if (!info) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    return NextResponse.json(info);
  } catch (err) {
    // Before db/library-access.sql runs the columns don't exist; the page just hides the line.
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
