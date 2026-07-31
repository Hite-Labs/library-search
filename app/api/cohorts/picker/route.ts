import { NextResponse } from 'next/server';
import { getJoinableCohorts } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/cohorts/picker?clientId=… — active cohorts this person could join, excluding
 * ones they're already enrolled in. The cohort-side mirror of /api/clients/picker: that
 * one picks a person to add to a cohort, this one picks a cohort to add a person to.
 */
export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }
  const cohorts = await getJoinableCohorts(clientId);
  return NextResponse.json({ cohorts });
}
