import { NextRequest, NextResponse } from 'next/server';
import {
  getClientByMemberstackId,
  getClientWithEnrollments,
  getSessionLogs,
  getClientContentByKind,
  getCohortForPortal,
  listLivePromos,
  getActiveChallenge,
  type Challenge,
  type Enrollment,
  type ContentItem,
  type Promo,
} from '@/lib/db';
import { getPresignedGetUrl } from '@/lib/r2';
import {
  verifyMemberToken,
  getMemberPlanState,
  planIdFor,
  isPlanKey,
  type PlanKey,
  type PlanFlags,
} from '@/lib/memberstack';
import { challengeAccess } from '@/lib/challenge-days';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * The individual payload as sent when the member isn't entitled to (or has no) coaching.
 * Built per-request rather than as a frozen constant so calendar_url can carry the global
 * booking link: someone with no pack still sees a working "book a session" CTA, which is
 * the one action we actually want from them.
 */
function emptyIndividual() {
  return {
    client: {
      goal: '',
      total_sessions: null,
      sessions_done: null,
      next_session_at: null,
      program_type: null,
      calendar_url: env.NEXT_PUBLIC_BOOKING_URL || null,
    },
    sessions: [],
    recordings: [],
    files: [],
  };
}

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

/**
 * The promo codes this member qualifies for.
 *
 * The rule is Lindsay's: show an offer only when the member does NOT already hold that
 * plan. One rule covers the whole matrix — individual members see cohort and membership
 * offers, cohort members see individual, and so on.
 *
 * Only codes go to the browser, never the rule behind them. The promo's words and images
 * are authored in Webflow; portal.js reveals the elements whose data-promo attribute is in
 * this list and hides the rest. That keeps the reveal decision here, on the server, which
 * matters because the browser's plan detection deliberately disagrees with this one —
 * $memberstackDom's payload can't be verified from the repo, so portal.js treats `active`
 * as disqualifying only when explicitly false (see public/portal.js, gateAndLoad).
 *
 * Deliberately generous about what counts as "doesn't hold it": a null plan state (we
 * couldn't look it up), an unset env id, or an unrecognised plan key all mean the promo
 * shows. Over-showing an upsell wastes an impression; under-showing one silently costs a
 * sale, and only the second failure is invisible.
 */
function visiblePromoCodes(promos: Promo[], planState: PlanFlags | null): string[] {
  return promos
    .filter((p) => {
      const key = p.hide_if_has;
      if (!key || !isPlanKey(key)) return true;
      return planState?.[key] !== true;
    })
    .map((p) => p.code);
}

/**
 * The portal-safe challenge object, or null when there is nothing to show.
 *
 * `unlocked_days` is the entire point: the day content lives in Webflow, so the server
 * never holds it and cannot leak it. All it does is say which day numbers this member may
 * see, and portal.js reveals those blocks.
 *
 * A run with no start date, or one whose grace window has closed, returns null rather than
 * an empty shell — "there is no challenge for you right now" and "your challenge has zero
 * days visible" would look identical in the portal, and only the first is true.
 *
 * Note the shape is not the DB shape (telegram_url → telegram_link), matching how
 * buildCohortObject renames on the way out. The portal contract is its own thing.
 */
function buildChallengeObject(run: Challenge | null) {
  if (!run || !run.start_date) return null;

  const access = challengeAccess(run);
  if (access.ended) return null;

  return {
    name: run.name,
    description: run.description,
    telegram_link: run.telegram_url || null,
    total_days: run.total_days,
    unlocked_days: access.unlocked,
    current_day: access.current_day,
    starts_at: run.start_date,
    access_ends_at: access.access_ends_at,
    started: access.started,
  };
}

/**
 * Is this cohort session still locked? Mirrors isCohortSessionLocked in public/portal.js —
 * and is now the authoritative copy. The script's version stays as presentation (it decides
 * which DOM row to show); this one decides what we actually SEND.
 *
 * That split matters: the browser check only ever hid a row, so every locked session's
 * playable URL was still in the JSON. Anyone could open devtools on day one and play the
 * final session. Same class of flaw as the plan gating fixed earlier — "hidden" is not
 * "not sent".
 *
 * A session is locked until its own date passes, UNLESS the cohort's end date has passed,
 * which unlocks the whole archive. Fails closed: a missing or unparseable date stays locked.
 */
function isSessionLocked(
  sessionDate: string | null,
  cohortEndDate: string | null,
): boolean {
  const now = Date.now();

  if (cohortEndDate) {
    const end = new Date(cohortEndDate).getTime();
    if (!isNaN(end) && now >= end) return false;
  }

  if (!sessionDate) return true;
  const unlock = new Date(sessionDate).getTime();
  if (isNaN(unlock)) return true;

  return now < unlock;
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

        // Locked sessions ship NO media — no signed recording URL, no file list. Presigning
        // a locked recording is what leaked it: the URL is live for an hour and playable by
        // anyone who reads the response, whatever the UI shows.
        //
        // title and prompt_text are deliberately still sent. The portal already displays
        // them on locked cards ("Session 5 — Boundaries"), which reads as intended design
        // rather than an oversight, and withholding them would silently change what members
        // see. If those should be hidden too, this is the one place to change.
        const locked = isSessionLocked(s.session_date, cohort.end_date);

        return {
          session_number: i + 1,
          session_date: s.session_date,
          title: s.title,
          prompt_text: s.prompt_text,
          locked,
          recording_url:
            locked || !recording ? null : await getPresignedGetUrl(recording.r2_key),
          file_type: locked || !recording ? null : recording.media_type,
          files: locked ? [] : await Promise.all(sessionFiles.map(toPortalFile)),
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
  //
  // No client record is NOT an error any more: a signed-up member who hasn't bought
  // anything has no row here, and they are exactly who the upsell exists for. Returning
  // 404 made the portal show "we couldn't find your coaching portal" to the person most
  // worth selling to. They now get an empty-but-valid payload plus promos.
  //
  // Still no data leak — everything below this point is keyed to a client id they don't
  // have, so there is nothing to return but the offers.
  const client = await getClientByMemberstackId(verified.id);
  if (!client) {
    // The challenge still has to be resolved on this path, and it is the only thing here
    // that can be. Someone who bought ONLY the challenge — never a coaching or cohort
    // client — has no clients row at all, so this is their normal path, not an edge case.
    // Returning null here would have meant they paid and saw nothing.
    //
    // Their plans are looked up for real, because for the challenge the plan is the
    // entitlement; there is no enrollment to fall back on.
    const [codesPlanState, livePromosOnly, runOnly] = await Promise.all([
      getMemberPlanState(verified.id),
      listLivePromos(),
      getActiveChallenge(),
    ]);
    const challengeOnly =
      codesPlanState?.challenge === true ? buildChallengeObject(runOnly) : null;

    // Promos still use a null plan state on purpose where the lookup failed: unknown
    // reads as "holds nothing", so they see every live offer, which is the right answer
    // for someone with no purchases.
    const codesOnly = visiblePromoCodes(livePromosOnly, codesPlanState);
    return NextResponse.json(
      {
        ...emptyIndividual(),
        cohort: null,
        challenge: challengeOnly,
        promo_codes: codesOnly,
      },
      { headers: cors },
    );
  }

  // 3. Entitlements + cohort + enrollments, together — the plan lookup is a network call to
  //    Memberstack, so it rides alongside the DB work rather than adding latency.
  //
  //    Plan state decides what we SEND, not just what the portal script chooses to show.
  //    Hiding a panel in the browser still shipped the data, so anyone reading the network
  //    response saw content they hadn't paid for.
  const [planState, cohortRaw, data, livePromos, challengeRun] = await Promise.all([
    getMemberPlanState(verified.id),
    buildCohortObject(verified.id),
    getClientWithEnrollments(client.id),
    listLivePromos(),
    getActiveChallenge(),
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
  function revoked(key: PlanKey): boolean {
    if (!planState) return false;
    if (!planIdFor(key)) return false;
    return planState[key] === false;
  }

  const cohort = revoked('cohort') ? null : cohortRaw;

  // Uses planState directly rather than `revoked()`: revoked() answers "should we take
  // access away", which is intentionally conservative, whereas this asks the simpler
  // "do they have it right now".
  const promoCodes = visiblePromoCodes(livePromos, planState);

  // The challenge inverts the rule above, and the inversion is deliberate.
  //
  // Coaching and cohort access come from the DATABASE — an enrollment the dashboard
  // created — so a Memberstack plan may only revoke, never grant, and only on a positive
  // signal. The challenge has no enrollment at all: holding the plan IS the entitlement,
  // however it was obtained (bought outright, bundled with the audio membership, or added
  // to an existing client). So here the plan must GRANT, which means requiring a positive
  // `true` and failing closed on anything unknown.
  //
  // Concretely: unreadable plan state or an unset MEMBERSTACK_CHALLENGE_PLAN_ID means no
  // challenge. That is the safe direction for the only plan people pay for directly —
  // the opposite choice would hand the challenge to everyone the moment the env var went
  // missing.
  const challenge = planState?.challenge === true ? buildChallengeObject(challengeRun) : null;

  // 4. Pick the individual enrollment to reflect. A revoked member is treated exactly like
  //    one with no enrollment: an empty-but-valid payload, never a 403 — they stay signed in
  //    and see the upsell, which is the point.
  const enrollment = !revoked('individual') && data ? pickEnrollment(data.enrollments) : null;

  if (!enrollment) {
    // Promos ride on this path too — a member with no coaching pack is exactly who the
    // upsell is for, so returning them here is the whole point rather than an afterthought.
    return NextResponse.json(
      { ...emptyIndividual(), cohort, challenge, promo_codes: promoCodes },
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
        // Where the portal's "schedule a session" CTA should point. Per-enrollment link
        // first, else the global booking link — the same precedence the client view uses
        // (app/clients/[id]/detail-view.tsx:530), so the portal and the dashboard agree on
        // which link a given client gets. null → the script leaves Webflow's href alone.
        calendar_url: enrollment.calendar_url || env.NEXT_PUBLIC_BOOKING_URL || null,
      },
      sessions,
      recordings,
      files,
      cohort,
      challenge,
      promo_codes: promoCodes,
    },
    { headers: cors },
  );
}
