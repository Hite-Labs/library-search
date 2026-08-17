import { NextRequest, NextResponse } from 'next/server';
import {
  getClientByMemberstackId,
  getClientWithEnrollments,
  getSessionLogs,
  getClientContentByKind,
  getCohortForPortal,
  type Enrollment,
  type ContentItem,
} from '@/lib/db';
import { getPresignedGetUrl } from '@/lib/r2';
import { verifyMemberToken, getMemberPlanState } from '@/lib/memberstack';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/** The individual payload as sent when the member isn't entitled to (or has no) coaching. */
const EMPTY_INDIVIDUAL = {
  client: {
    goal: '',
    total_sessions: null,
    sessions_done: null,
    next_session_at: null,
    program_type: null,
  },
  sessions: [],
  recordings: [],
  files: [],
} as const;

// ── CORS ─────────────────────────────────────────────────────────────────────
// The Webflow portal calls this cross-origin with an Authorization header, which
// triggers a preflight. next.config headers() can't reflect a per-request Origin,
// so we set CORS here against an allowlist: the configured portal origin plus any
// *.webflow.io (staging). A non-allowlisted Origin simply gets no ACAO header.
function portalOrigin(): string | null {
  if (!env.NEXT_PUBLIC_PORTAL_LOGIN_URL) return null;
  try {
    return new URL(env.NEXT_PUBLIC_PORTAL_LOGIN_URL).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === portalOrigin()) return true;
  try {
    const host = new URL(origin).hostname;
    return host === 'webflow.io' || host.endsWith('.webflow.io');
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin as string;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  }
  return headers;
}

// Preflight for the token-bearing cross-origin GET.
export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

// Pick the enrollment the portal reflects: the active individual pack, else the most
// recent individual one, else the most recent enrollment of any kind. (enrollments are
// already sorted created_at DESC by getClientWithEnrollments.)
function pickEnrollment(enrollments: Enrollment[]): Enrollment | null {
  const individual = enrollments.filter((e) => e.program_type === 'individual');
  return (
    individual.find((e) => e.status === 'active') ??
    individual[0] ??
    enrollments[0] ??
    null
  );
}

// Build the portal-safe cohort object for a member (single active cohort), or null.
// Sessions are numbered oldest=1 (matching the individual sessions projection), each with
// its discussion prompt and files carrying fresh signed GET URLs (never the raw R2 url).
async function buildCohortObject(memberstackId: string) {
  const data = await getCohortForPortal(memberstackId);
  if (!data) return null;
  const { cohort, memberGoal, sessions, filesBySession, cohortFiles, myFiles } = data;

  // Shared projection for a cohort file card (portal-safe: signed URL, never the r2 key).
  // uploaded_at is created_at (when it was added to the dashboard), matching the
  // individual side's recorded_at/uploaded_at — not a date the document itself claims.
  const toPortalFile = async (f: ContentItem) => ({
    title: f.title,
    description: f.description || null,
    uploaded_at: f.created_at,
    public_url: await getPresignedGetUrl(f.r2_key),
    file_type: f.media_type,
  });

  // getCohortSessions orders by sort_order/session_date; number oldest=1 for display.
  const [portalSessions, portalCohortFiles, portalMyFiles] = await Promise.all([
    Promise.all(
      sessions.map(async (s, i) => {
        // One recording per session: the newest playable (audio/video) file attached to it.
        // `kind` can't be used to pick it — insertCohortContent never sets that column, so
        // every cohort row carries the 'recording' default. filesBySession is already
        // created_at DESC, so the first match is the most recent upload. PDFs are never
        // the recording; they stay in files[] as attachments alongside any older media.
        const sessionFiles = filesBySession.get(s.id) ?? [];
        const recording = sessionFiles.find((f) => f.media_type !== 'pdf') ?? null;
        return {
          session_number: i + 1,
          session_date: s.session_date,
          title: s.title,
          prompt_text: s.prompt_text,
          recording_url: recording ? await getPresignedGetUrl(recording.r2_key) : null,
          file_type: recording ? recording.media_type : null,
          files: await Promise.all(sessionFiles.map(toPortalFile)),
        };
      }),
    ),
    Promise.all(cohortFiles.map(toPortalFile)),
    Promise.all(myFiles.map(toPortalFile)),
  ]);

  return {
    id: cohort.id,
    name: cohort.name,
    zoom_link: cohort.zoom_url,
    telegram_link: cohort.telegram_url,
    end_date: cohort.end_date,
    // Group progress, advanced manually by the coach — the cohort counterpart of the
    // individual pack's sessions_done / total_sessions.
    sessions_done: cohort.current_session,
    total_sessions: cohort.total_sessions,
    sessions: portalSessions,
    files: portalCohortFiles,
    my_files: portalMyFiles,
    member_goal: memberGoal,
  };
}

// GET /api/portal — Memberstack-gated, member-scoped, portal-safe client data.
// Verifies the _ms-mid token, resolves the client, and returns goal/progress + sessions
// (NEVER internal notes/coach_actions) + recordings with fresh signed URLs.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  // 1. Verify the member token (same trusted-id pattern as /api/search).
  const authHeader = req.headers.get('authorization');
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  const verified = token ? await verifyMemberToken(token) : null;
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
  }

  // 2. Resolve the client linked to this member.
  const client = await getClientByMemberstackId(verified.id);
  if (!client) {
    return NextResponse.json({ error: 'No client linked to this member' }, { status: 404, headers: cors });
  }

  // 3. Entitlements + cohort + enrollments, together — the plan lookup is a network call to
  //    Memberstack, so it rides alongside the DB work rather than adding latency.
  //
  //    Plan state decides what we SEND, not just what the portal script chooses to show.
  //    Hiding a panel in the browser still shipped the data, so anyone reading the network
  //    response saw content they hadn't paid for.
  const [planState, cohortRaw, data] = await Promise.all([
    getMemberPlanState(verified.id),
    buildCohortObject(verified.id),
    getClientWithEnrollments(client.id),
  ]);

  // A Memberstack plan can only REVOKE what the dashboard granted, never grant on its own.
  //
  // The DB is the source of truth for enrollment: `ensureMemberPlans` (lib/db.ts:456) fails
  // soft in four separate ways — Memberstack unconfigured, plan state unreadable, plan id
  // unset, or the attach call throwing — and each of those saves the enrollment with only a
  // warning. So a real cohort member can legitimately hold no Memberstack plan, and letting
  // the plan check veto their enrollment would empty the tab of someone who belongs there.
  //
  // Hence: revoke only on a POSITIVE, trustworthy "they don't hold it" —
  //   - planState === null            → unknown (unconfigured or unreachable) → keep access
  //   - plan id env var unset         → the flag is hardcoded false upstream, not measured,
  //                                     so it carries no information → keep access
  //   - flag false with an id present → genuinely lapsed or never attached → revoke
  //
  // getMemberPlanState filters cancelled/expired connections, so a lapsed member reads as
  // unentitled here — which is the intended behaviour for D5.
  function revoked(configuredPlanId: string | undefined, holds: boolean | undefined): boolean {
    if (!planState) return false;
    if (!configuredPlanId) return false;
    return holds === false;
  }

  const cohort = revoked(env.MEMBERSTACK_COHORT_PLAN_ID, planState?.hasCohortPlan)
    ? null
    : cohortRaw;

  // 4. Pick the individual enrollment to reflect. A revoked member is treated exactly like
  //    one with no enrollment: an empty-but-valid payload, never a 403 — they stay signed in
  //    and see the upsell, which is the point.
  const individualRevoked = revoked(
    env.MEMBERSTACK_INDIVIDUAL_PLAN_ID,
    planState?.hasIndividualPlan,
  );
  const enrollment = !individualRevoked && data ? pickEnrollment(data.enrollments) : null;

  if (!enrollment) {
    return NextResponse.json({ ...EMPTY_INDIVIDUAL, cohort }, { headers: cors });
  }

  // 5. Sessions — portal-safe projection. Logs come back session_date DESC; number them
  //    so the OLDEST session = 1. Strip notes and coach_actions entirely.
  const logs = await getSessionLogs(enrollment.id);
  const total = logs.length;
  const sessions = logs.map((l, i) => ({
    session_date: l.session_date,
    next_actions: l.next_actions,
    session_number: total - i, // DESC array → oldest gets 1
  }));

  // 6. Recordings (kind='recording') and files (kind='file') — fresh signed GET URLs
  //    (never the raw R2 url). file_type mirrors media_type so the portal renders each item
  //    without guessing from the URL extension (DS-08).
  const [rawRecordings, rawFiles] = await Promise.all([
    getClientContentByKind(client.id, 'recording'),
    getClientContentByKind(client.id, 'file'),
  ]);
  // recorded_at: content_items has no true "session recorded" date, so this is created_at
  // (when the recording was added). Accurate when uploaded near the session; for a bulk
  // backfill every card shows the same day. Swap in a real column later without renaming.
  const recordings = await Promise.all(
    rawRecordings.map(async (r) => ({
      title: r.title,
      session_label: r.session_label,
      recorded_at: r.created_at,
      public_url: await getPresignedGetUrl(r.r2_key),
      file_type: r.media_type,
    })),
  );
  // uploaded_at carries the same caveat as recorded_at above: it's created_at, i.e. when
  // the file was added to the dashboard, not a date the document itself claims.
  const files = await Promise.all(
    rawFiles.map(async (f) => ({
      title: f.title,
      description: f.description || null,
      uploaded_at: f.created_at,
      public_url: await getPresignedGetUrl(f.r2_key),
      file_type: f.media_type,
    })),
  );

  return NextResponse.json(
    {
      client: {
        goal: enrollment.goal,
        total_sessions: enrollment.total_sessions,
        sessions_done: enrollment.sessions_done,
        next_session_at: enrollment.next_session_at,
        program_type: enrollment.program_type,
      },
      sessions,
      recordings,
      files,
      cohort,
    },
    { headers: cors },
  );
}
