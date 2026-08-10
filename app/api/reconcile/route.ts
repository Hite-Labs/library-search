import { NextResponse } from 'next/server';
import { listClientEntitlements, setClientMemberstackId } from '@/lib/db';
import {
  listMembersWithPlans,
  setMemberPlan,
  isMemberstackConfigured,
} from '@/lib/memberstack';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Reconciliation between the dashboard (source of truth for enrollment) and Memberstack
 * (which actually gates the portal). Drift happens because plans can be toggled directly
 * in Memberstack, and because removing a cohort member deliberately doesn't revoke plans.
 *
 * Everything is matched on email — the stable identity across both systems. memberstack_id
 * is stored on clients but is null for anyone never provisioned, so it can't be the key.
 *
 * GET is read-only against Memberstack but does repair one thing in Postgres: a client
 * matched by email whose memberstack_id is null gets it written back (see `backfilled`).
 * Plan changes stay behind POST, one at a time.
 */

type Issue = {
  kind:
    | 'missing-plan'        // dashboard says entitled, Memberstack doesn't grant it
    | 'extra-plan'          // Memberstack grants it, no active enrollment says it should
    | 'not-provisioned'     // client entitled to something but has no Memberstack member
    | 'no-program'          // client with no member AND no enrollment — never started
    | 'orphan-member';      // Memberstack member with a coaching plan, no client record
  planType: 'individual' | 'cohort' | null;
  email: string;
  name: string | null;
  clientId: string | null;
  memberstackId: string | null;
  detail: string;
};

export async function GET() {
  if (!isMemberstackConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Memberstack is not configured (MEMBERSTACK_SECRET_KEY unset)' },
      { status: 503 },
    );
  }

  // Without the plan ids every member reads as "has no plans", so the diff would report a
  // clean slate while comparing against nothing — the most dangerous possible output for
  // this page. Refuse rather than reassure.
  const missingPlanIds = [
    env.MEMBERSTACK_INDIVIDUAL_PLAN_ID ? null : 'MEMBERSTACK_INDIVIDUAL_PLAN_ID',
    env.MEMBERSTACK_COHORT_PLAN_ID ? null : 'MEMBERSTACK_COHORT_PLAN_ID',
  ].filter((v): v is string => v !== null);

  if (missingPlanIds.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Cannot check access: ${missingPlanIds.join(' and ')} not set. ` +
          `Without the plan ids every member looks unentitled, so a clean result would be meaningless.`,
      },
      { status: 503 },
    );
  }

  const [clients, members] = await Promise.all([
    listClientEntitlements(),
    listMembersWithPlans(),
  ]);

  if (!members) {
    return NextResponse.json(
      { ok: false, error: 'Could not read members from Memberstack' },
      { status: 503 },
    );
  }

  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  const seenEmails = new Set<string>();
  const issues: Issue[] = [];
  let backfilled = 0;

  for (const c of clients) {
    const email = c.email.toLowerCase();
    seenEmails.add(email);
    const member = byEmail.get(email);

    if (!member) {
      if (c.wantsIndividual || c.wantsCohort) {
        issues.push({
          kind: 'not-provisioned',
          planType: null,
          email: c.email,
          name: c.name,
          clientId: c.client_id,
          memberstackId: null,
          detail: 'Has an active enrollment but no Memberstack member — they cannot reach the portal.',
        });
      } else {
        // No member and nothing entitling them to one. Usually benign — a lead, or someone
        // whose program ended — but it was previously invisible here, which made a genuinely
        // stranded record indistinguishable from a clean check.
        issues.push({
          kind: 'no-program',
          planType: null,
          email: c.email,
          name: c.name,
          clientId: c.client_id,
          memberstackId: null,
          detail: 'No active enrollment and no Memberstack member — they cannot log in.',
        });
      }
      continue;
    }

    // Their member was found by email but the id was never stored. Repair it: the portal
    // resolves the logged-in member through this column alone (getClientByMemberstackId),
    // so a null here is a real outage for them — yet every plan check below passes, which
    // is why this cannot be left to a human to notice. Email is the identity key and the
    // column is UNIQUE, so a bad match errors rather than corrupting quietly.
    if (!c.memberstack_id) {
      try {
        await setClientMemberstackId(c.client_id, member.id);
        backfilled += 1;
      } catch (err) {
        // One failed repair must not sink the whole diff — the plan comparison below is
        // still valid and is what the operator came here for. Logged rather than
        // swallowed because a UNIQUE violation here would mean two clients are fighting
        // over one member id, i.e. the email-as-identity assumption has broken down.
        console.error(`[reconcile] backfill failed for client ${c.client_id}:`, err);
      }
    }

    const checks = [
      { type: 'individual' as const, wants: c.wantsIndividual, has: member.hasIndividualPlan },
      { type: 'cohort' as const, wants: c.wantsCohort, has: member.hasCohortPlan },
    ];

    for (const { type, wants, has } of checks) {
      if (wants && !has) {
        issues.push({
          kind: 'missing-plan',
          planType: type,
          email: c.email,
          name: c.name,
          clientId: c.client_id,
          memberstackId: member.id,
          detail: `Enrolled in a ${type} program but the ${type} plan is not active — their portal tab will be missing.`,
        });
      } else if (!wants && has) {
        issues.push({
          kind: 'extra-plan',
          planType: type,
          email: c.email,
          name: c.name,
          clientId: c.client_id,
          memberstackId: member.id,
          detail: `Holds the ${type} plan with no active ${type} enrollment — they see an empty ${type} panel.`,
        });
      }
    }
  }

  // Members carrying a coaching plan with no matching client record at all.
  for (const m of members) {
    if (seenEmails.has(m.email.toLowerCase())) continue;
    if (!m.hasIndividualPlan && !m.hasCohortPlan) continue;
    issues.push({
      kind: 'orphan-member',
      planType: m.hasIndividualPlan ? 'individual' : 'cohort',
      email: m.email,
      name: null,
      clientId: null,
      memberstackId: m.id,
      detail: 'Has a coaching plan in Memberstack but no client record in the dashboard.',
    });
  }

  return NextResponse.json({
    ok: true,
    checkedClients: clients.length,
    checkedMembers: members.length,
    backfilled,
    issues,
  });
}

/**
 * POST /api/reconcile — apply one fix. Deliberately one at a time rather than a
 * "fix everything" button: each of these changes someone's portal access, and a bulk
 * apply over a misread diff would be hard to undo.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const memberstackId = body?.memberstackId;
  const planType = body?.planType;
  const action = body?.action;

  if (
    typeof memberstackId !== 'string' ||
    (planType !== 'individual' && planType !== 'cohort') ||
    (action !== 'attach' && action !== 'detach')
  ) {
    return NextResponse.json(
      { error: 'memberstackId, planType (individual|cohort) and action (attach|detach) are required' },
      { status: 400 },
    );
  }

  try {
    const done = await setMemberPlan(memberstackId, planType, action === 'attach');
    if (!done) {
      return NextResponse.json(
        { ok: false, error: `Memberstack not configured, or no plan id set for ${planType}` },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
