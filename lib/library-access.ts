import { getSql, type Client } from './db';
import { env } from './env';
import {
  holdsIncludedMembership,
  isMemberstackConfigured,
  setIncludedMembershipPlan,
} from './memberstack';

/**
 * Library access for individual coaching clients (docs/scope-coaching-library-access.md).
 *
 * The rule:
 *
 *   access ends = (the later of: last logged individual session, the date we granted it) + N days
 *
 * N is the `coaching_library_days` setting (default 30). Access is the free "membership
 * included" Memberstack plan, which planIdsFor counts as the membership — so everything that
 * already asks "do they have the library" says yes without knowing this exists.
 *
 * Granted when someone becomes an individual client, when a session is logged for someone
 * whose access had ended, and by the one-off grant on the Access page. Taken away by the daily
 * expiry, which stamps `library_access_ended_at` — the "lapsed" state the library page uses to
 * show a different pitch for the next N days.
 *
 * The paid SYS Society plan is never read or written here. Someone who pays keeps the library
 * whatever happens to this plan.
 */

const DEFAULT_DAYS = 30;

export function isLibraryAccessConfigured(): boolean {
  const included = env.MEMBERSTACK_MEMBERSHIP_INCLUDED_PLAN_ID;
  // Refuse to run if the included id was set to the PAID plan's id by mistake: the expiry
  // would then be removing SYS Society from people who pay for it.
  if (included && included === env.MEMBERSTACK_MEMBERSHIP_PLAN_ID) {
    console.error('[library-access] MEMBERSTACK_MEMBERSHIP_INCLUDED_PLAN_ID is the paid plan id — disabled');
    return false;
  }
  return isMemberstackConfigured() && Boolean(included);
}

/** The N in the rule. Falls back to 30 when the setting is missing or the table isn't there yet. */
export async function getCoachingLibraryDays(): Promise<number> {
  try {
    const sql = getSql();
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'coaching_library_days'`;
    const n = Number(rows[0]?.value);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAYS;
  } catch {
    return DEFAULT_DAYS;
  }
}

export async function setCoachingLibraryDays(days: number): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('coaching_library_days', ${JSON.stringify(days)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

/**
 * Give this client the included plan and start (or restart) their clock.
 *
 * Read-then-write, so a plan they already hold isn't re-added. The DB stamp only happens once
 * the plan is really on them — a stamp without the plan would show "access until …" on the
 * dashboard for someone who can't open the library.
 *
 * Never throws: like provisioning, a Memberstack problem must not block the write that called
 * this. It comes back as `warning`. Not configured is silent — there's nothing to warn about
 * on an install that doesn't use this.
 */
export async function grantCoachingLibraryAccess(
  client: Pick<Client, 'id' | 'memberstack_id'>,
): Promise<{ granted: boolean; warning?: string }> {
  if (!isLibraryAccessConfigured()) return { granted: false };
  if (!client.memberstack_id) {
    return {
      granted: false,
      warning: 'No library access given — they have no Memberstack account yet.',
    };
  }
  try {
    const sql = getSql();
    // Touch the column first. Before db/library-access.sql runs it doesn't exist, and this
    // throws HERE — rather than after the plan is attached, which would leave a plan with no
    // grant date that the daily expiry could never find.
    await sql`SELECT library_access_granted_at FROM clients WHERE id = ${client.id}`;

    const holds = await holdsIncludedMembership(client.memberstack_id);
    if (holds === null) {
      return {
        granted: false,
        warning: 'Library access not given — their Memberstack plans could not be read.',
      };
    }
    if (!holds) await setIncludedMembershipPlan(client.memberstack_id, true);

    await sql`
      UPDATE clients
         SET library_access_granted_at = now(), library_access_ended_at = NULL
       WHERE id = ${client.id}`;
    return { granted: true };
  } catch (err) {
    return { granted: false, warning: `Giving library access failed: ${String(err)}` };
  }
}

/**
 * After a session is logged on an individual pack: if this client's access had ended (or they
 * never had it), give it back — they're being coached again.
 *
 * A backdated log of an old session whose window has already passed changes nothing: it can't
 * reopen access that would end immediately. While access is still running there's nothing to
 * do; the new session moves the end date by itself, since it's worked out from the logs.
 */
export async function refreshAfterSession(
  clientId: string,
  sessionDate: string,
): Promise<{ granted: boolean; warning?: string }> {
  if (!isLibraryAccessConfigured()) return { granted: false };
  const sql = getSql();
  const rows = await sql`SELECT * FROM clients WHERE id = ${clientId}`;
  const client = rows[0] as Client | undefined;
  if (!client) return { granted: false };

  const running = client.library_access_granted_at && !client.library_access_ended_at;
  if (running) return { granted: false };

  const days = await getCoachingLibraryDays();
  const windowEnds = new Date(sessionDate).getTime() + days * 86_400_000;
  if (!(windowEnds > Date.now())) return { granted: false };

  return grantCoachingLibraryAccess(client);
}

export interface LibraryAccessInfo {
  configured: boolean;
  days: number;
  /** running = has it now; ended = we took it away; never = we never gave it. */
  status: 'running' | 'ended' | 'never';
  grantedAt: string | null;
  endedAt: string | null;
  lastSessionAt: string | null;
  /** When it ends (or ended) by the rule. Null when it was never given. */
  endsAt: string | null;
}

/** The latest of two timestamps, either of which may be missing. */
function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

/** One client's library access, for their dashboard page. Null when the client doesn't exist. */
export async function getLibraryAccessInfo(clientId: string): Promise<LibraryAccessInfo | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT c.library_access_granted_at, c.library_access_ended_at,
           (SELECT max(sl.session_date)
              FROM session_logs sl JOIN enrollments e ON e.id = sl.enrollment_id
             WHERE e.client_id = c.id AND e.program_type = 'individual') AS last_session_at
      FROM clients c WHERE c.id = ${clientId}`;
  const r = rows[0];
  if (!r) return null;

  const days = await getCoachingLibraryDays();
  const toIso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const grantedAt = toIso(r.library_access_granted_at);
  const endedAt = toIso(r.library_access_ended_at);
  const lastSessionAt = toIso(r.last_session_at);
  const from = grantedAt ? later(grantedAt, lastSessionAt) : null;

  return {
    configured: isLibraryAccessConfigured(),
    days,
    status: !grantedAt ? 'never' : endedAt ? 'ended' : 'running',
    grantedAt,
    endedAt,
    lastSessionAt,
    endsAt: from ? new Date(new Date(from).getTime() + days * 86_400_000).toISOString() : null,
  };
}

/**
 * Is this member a coaching client whose library access ended recently?
 *
 * Only meaningful for someone who doesn't hold the membership now — the caller checks that.
 * "Recently" is the same N days: after that they go back to the normal pitch.
 */
export async function isLibraryLapsed(client: Client): Promise<boolean> {
  if (!client.library_access_ended_at) return false;
  const days = await getCoachingLibraryDays();
  const ended = new Date(client.library_access_ended_at).getTime();
  return Date.now() - ended < days * 86_400_000;
}

// ── The one-off grant for clients who were already being coached ──────────────────

export interface BackfillCandidate {
  id: string;
  name: string;
  email: string;
  memberstack_id: string | null;
}

/**
 * Current individual clients (active or paused pack) who have never been given library
 * access. People whose access already ended are deliberately not here: the daily expiry ended
 * it, and a logged session is what brings it back.
 */
export async function listBackfillCandidates(): Promise<BackfillCandidate[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.name, c.email, c.memberstack_id
      FROM clients c
     WHERE c.library_access_granted_at IS NULL
       AND EXISTS (SELECT 1 FROM enrollments e
                    WHERE e.client_id = c.id AND e.program_type = 'individual'
                      AND e.status IN ('active', 'paused'))
     ORDER BY lower(c.name)`;
  return rows as BackfillCandidate[];
}

/**
 * Grant every candidate, one at a time. Each grant stamps today as the start, so someone whose
 * last session was months ago still gets the full N days rather than losing it tomorrow.
 */
export async function backfillCoachingLibraryAccess(): Promise<{
  granted: number;
  skipped: { name: string; email: string; reason: string }[];
}> {
  const candidates = await listBackfillCandidates();
  let granted = 0;
  const skipped: { name: string; email: string; reason: string }[] = [];
  for (const c of candidates) {
    const out = await grantCoachingLibraryAccess(c);
    if (out.granted) granted++;
    else skipped.push({ name: c.name, email: c.email, reason: out.warning ?? 'Not configured' });
  }
  return { granted, skipped };
}

// ── The daily expiry ───────────────────────────────────────────────────────────────

/**
 * Claim today's run. Atomic, so two overlapping cron ticks (or two app processes) can't both
 * run it. False = already ran within the last day, or the table isn't there yet.
 */
async function claimDailyRun(): Promise<boolean> {
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE app_settings SET value = to_jsonb(now()), updated_at = now()
       WHERE key = 'library_expiry_last_run' AND updated_at < now() - interval '23 hours'
      RETURNING key`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Take the included plan away from everyone whose N days are up. Called from the once-a-minute
 * cron tick; does real work at most once a day.
 *
 * A Memberstack failure for one person undoes their ended stamp, so the next run tries again
 * rather than recording an end that didn't happen.
 */
export async function runDailyLibraryExpiry(): Promise<{ ran: boolean; ended: number; failed: number }> {
  if (!isLibraryAccessConfigured()) return { ran: false, ended: 0, failed: 0 };
  if (!(await claimDailyRun())) return { ran: false, ended: 0, failed: 0 };

  const sql = getSql();
  try {
    return await expireDue();
  } catch (err) {
    // The whole run failed (a database blip, say). Give the day back so the next tick retries,
    // rather than leaving everyone's expiry for another 23 hours.
    await sql`UPDATE app_settings SET updated_at = 'epoch' WHERE key = 'library_expiry_last_run'`
      .catch(() => {});
    throw err;
  }
}

async function expireDue(): Promise<{ ran: boolean; ended: number; failed: number }> {
  const sql = getSql();
  const days = await getCoachingLibraryDays();
  const due = await sql`
    SELECT c.id, c.memberstack_id, c.library_access_granted_at::text AS granted_key
      FROM clients c
      LEFT JOIN LATERAL (
        SELECT max(sl.session_date) AS last
          FROM session_logs sl JOIN enrollments e ON e.id = sl.enrollment_id
         WHERE e.client_id = c.id AND e.program_type = 'individual'
      ) s ON true
     WHERE c.library_access_granted_at IS NOT NULL
       AND c.library_access_ended_at IS NULL
       AND greatest(c.library_access_granted_at, s.last) + make_interval(days => ${days}) < now()`;

  let ended = 0;
  let failed = 0;
  for (const row of due as { id: string; memberstack_id: string | null; granted_key: string }[]) {
    // Stamp the end FIRST, and only if nothing changed since the query: a session logged or a
    // new pack started in the meantime re-stamps granted_at, and must not be overwritten here.
    // Compared as text: a round trip through a JS Date drops the microseconds and never matches.
    const claimed = await sql`
      UPDATE clients SET library_access_ended_at = now()
       WHERE id = ${row.id} AND library_access_ended_at IS NULL
         AND library_access_granted_at::text = ${row.granted_key}
      RETURNING id`;
    if (claimed.length === 0) continue;
    try {
      // No Memberstack account, or the plan was already removed by hand: nothing to remove,
      // just record the end. Unreadable is a failure — retry tomorrow.
      if (row.memberstack_id) {
        const holds = await holdsIncludedMembership(row.memberstack_id);
        if (holds === null) throw new Error('Memberstack plans could not be read');
        if (holds) await setIncludedMembershipPlan(row.memberstack_id, false);
      }
      ended++;
    } catch (err) {
      // The plan is still on them — undo the stamp so tomorrow's run tries again.
      await sql`UPDATE clients SET library_access_ended_at = NULL WHERE id = ${row.id}`.catch(() => {});
      failed++;
      console.error(`[library-access] could not end access for client ${row.id}:`, err);
    }
  }
  if (ended || failed) console.log(`[library-access] daily expiry: ${ended} ended, ${failed} failed`);
  return { ran: true, ended, failed };
}
