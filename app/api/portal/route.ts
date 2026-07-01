import { NextRequest, NextResponse } from 'next/server';
import {
  getClientByMemberstackId,
  getClientWithEnrollments,
  getSessionLogs,
  getClientContentByKind,
  getCohortForPortal,
  type Enrollment,
} from '@/lib/db';
import { getPresignedGetUrl } from '@/lib/r2';
import { verifyMemberToken } from '@/lib/memberstack';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

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
  const { cohort, memberGoal, sessions, filesBySession } = data;

  // getCohortSessions orders by sort_order/session_date; number oldest=1 for display.
  const portalSessions = await Promise.all(
    sessions.map(async (s, i) => {
      const rawFiles = filesBySession.get(s.id) ?? [];
      const files = await Promise.all(
        rawFiles.map(async (f) => ({
          title: f.title,
          public_url: await getPresignedGetUrl(f.r2_key),
          file_type: f.media_type,
        })),
      );
      return {
        session_number: i + 1,
        session_date: s.session_date,
        prompt_text: s.prompt_text,
        files,
      };
    }),
  );

  return {
    id: cohort.id,
    name: cohort.name,
    zoom_link: cohort.zoom_url,
    telegram_link: cohort.telegram_url,
    sessions: portalSessions,
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

  // 3. Cohort object (single active cohort) — independent of the individual enrollment,
  //    so a cohort-only member (no individual pack) still gets their cohort tab.
  const cohort = await buildCohortObject(verified.id);

  // 4. Pick the individual enrollment to reflect.
  const data = await getClientWithEnrollments(client.id);
  const enrollment = data ? pickEnrollment(data.enrollments) : null;

  if (!enrollment) {
    // Linked client but no individual enrollment — return an empty-but-valid individual
    // payload, but still surface the cohort object if the member has one.
    return NextResponse.json(
      {
        client: { goal: '', total_sessions: null, sessions_done: null, next_session_at: null, program_type: null },
        sessions: [],
        recordings: [],
        files: [],
        cohort,
      },
      { headers: cors },
    );
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
  const recordings = await Promise.all(
    rawRecordings.map(async (r) => ({
      title: r.title,
      session_label: r.session_label,
      public_url: await getPresignedGetUrl(r.r2_key),
      file_type: r.media_type,
    })),
  );
  const files = await Promise.all(
    rawFiles.map(async (f) => ({
      title: f.title,
      description: f.description || null,
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
