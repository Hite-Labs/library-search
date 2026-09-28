import { NextResponse } from 'next/server';
import { getClientById } from '@/lib/db';
import { createCustomAudio, listCustomAudios } from '@/lib/custom-audios';
import { CustomAudioCreateSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

// GET /api/clients/[id]/custom-audios — every custom audio for this person, any status.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json({ audios: await listCustomAudios(id) });
}

// POST /api/clients/[id]/custom-audios — start a delivery (CC-13). The file comes next, via
// POST /api/custom-audios/[id]/upload-url then PATCH with the key.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = CustomAudioCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  if (!(await getClientById(id))) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  const audio = await createCustomAudio(id, parsed.data);
  return NextResponse.json({ audio }, { status: 201 });
}
