import { NextResponse } from 'next/server';
import { listClientsForPicker } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/clients/picker — id/name/email for every client, for the cohort roster's
 * "add an existing person" picker. Deliberately minimal: the picker only needs enough
 * to search and identify, and this avoids the enrollment aggregation GET /api/clients does.
 */
export async function GET() {
  const clients = await listClientsForPicker();
  return NextResponse.json({ clients });
}
