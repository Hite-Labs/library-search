import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { env } from './env';
import {
  provisionMember,
  getMemberPlanState,
  setMemberPlan,
  isMemberstackConfigured,
  PlanType,
} from './memberstack';

let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(env.NEON_DATABASE_URL);
  return _sql;
}

export interface ContentItem {
  id: string;
  webflow_item_id: string | null;
  title: string;
  description: string;
  media_type: 'audio' | 'video' | 'pdf';
  use_cases: string;
  modality: string | null;
  mood_tags: string;
  duration_seconds: number | null;
  r2_key: string;
  public_url: string;
  content_page_url: string | null;
  transcript: string | null;
  program_id: string | null;
  sequence_order: number | null;
  created_at: string;
  // Client/cohort recording columns (added via ALTER TABLE; present on recording rows).
  client_id: string | null;
  cohort_id: string | null;
  downloadable: boolean;
  session_label: string | null;
  // 'recording' = client's session Zoom calls; 'file' = standalone delivered assets
  // (EFT/hypnotherapy audio, PDFs). Drives the portal's recordings[] vs files[] split (DS-08).
  kind: 'recording' | 'file';
  // Cohort content tied to a specific cohort_session (nullable; cohort-wide when null).
  cohort_session_id: string | null;
}

export interface MatchResult {
  id: string;
  webflow_item_id: string | null;
  title: string;
  description: string;
  media_type: string;
  use_cases: string;
  modality: string | null;
  mood_tags: string;
  duration_seconds: number | null;
  public_url: string;
  content_page_url: string | null;
  similarity: number;
}

export async function insertContentItem(data: {
  title: string;
  description: string;
  mediaType: 'audio' | 'video' | 'pdf';
  useCases: string;
  modality: string;
  moodTags: string;
  durationSeconds: number | null;
  r2Key: string;
  publicUrl: string;
  transcript: string | null;
  embedding: number[];
}): Promise<string> {
  const sql = getSql();
  const embeddingStr = `[${data.embedding.join(',')}]`;
  const rows = await sql`
    INSERT INTO content_items
      (title, description, media_type, use_cases, mood_tags, modality,
       duration_seconds, r2_key, public_url, transcript, embedding)
    VALUES
      (${data.title}, ${data.description}, ${data.mediaType}, ${data.useCases},
       ${data.moodTags}, ${data.modality}, ${data.durationSeconds},
       ${data.r2Key}, ${data.publicUrl}, ${data.transcript}, ${embeddingStr}::vector)
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function updateWebflowItemId(neonId: string, webflowItemId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE content_items SET webflow_item_id = ${webflowItemId} WHERE id = ${neonId}
  `;
}

export async function updateContentPageUrl(neonId: string, contentPageUrl: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE content_items SET content_page_url = ${contentPageUrl} WHERE id = ${neonId}
  `;
}

export async function matchContentItems(
  embedding: number[],
  matchThreshold: number,
  matchCount: number,
): Promise<MatchResult[]> {
  const sql = getSql();
  const embeddingStr = `[${embedding.join(',')}]`;
  const rows = await sql`
    SELECT * FROM match_content_items(
      ${embeddingStr}::vector,
      ${matchThreshold},
      ${matchCount}
    )
  `;
  return rows as MatchResult[];
}

/**
 * Cohort ids a Memberstack member belongs to (via their client → enrollments).
 * Empty array if the member isn't linked to any client or any cohort.
 */
export async function getCohortIdsForMember(memberstackId: string): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT e.cohort_id
    FROM enrollments e
    JOIN clients c ON c.id = e.client_id
    WHERE c.memberstack_id = ${memberstackId}
      AND e.cohort_id IS NOT NULL
  `;
  return rows.map((r) => r.cohort_id as string);
}

/**
 * Member-scoped variant of matchContentItems: returns the public library PLUS the
 * member's own cohort content. Mirrors the match_content_items SQL function but widens
 * the visibility filter. Private per-client recordings (client_id set) stay excluded.
 */
export async function matchContentItemsForMember(
  embedding: number[],
  matchThreshold: number,
  matchCount: number,
  cohortIds: string[],
): Promise<MatchResult[]> {
  if (cohortIds.length === 0) {
    return matchContentItems(embedding, matchThreshold, matchCount);
  }
  const sql = getSql();
  const embeddingStr = `[${embedding.join(',')}]`;
  const rows = await sql`
    SELECT ci.id, ci.webflow_item_id, ci.title, ci.description, ci.media_type,
           ci.use_cases, ci.modality, ci.mood_tags, ci.duration_seconds,
           ci.public_url, ci.content_page_url,
           1 - (ci.embedding <=> ${embeddingStr}::vector) AS similarity
    FROM content_items ci
    WHERE ci.client_id IS NULL
      AND (ci.cohort_id IS NULL OR ci.cohort_id = ANY(${cohortIds}))
      AND 1 - (ci.embedding <=> ${embeddingStr}::vector) > ${matchThreshold}
    ORDER BY ci.embedding <=> ${embeddingStr}::vector ASC
    LIMIT ${matchCount}
  `;
  return rows as MatchResult[];
}

// ── Public library browser (admin) ───────────────────────────────────────────

/**
 * Row shape for the library browser list. Deliberately omits two columns that
 * ContentItem/`SELECT *` would drag along: `embedding` (vector(1024) — absent from
 * the ContentItem interface but very much present on the wire, ~20KB per row) and
 * `transcript` (routinely 12k+ characters). The transcript is replaced by its
 * length so the list can flag "has a transcript" without shipping the text; the
 * full transcript comes back only from getLibraryItem.
 */
export interface LibraryListItem {
  id: string;
  webflow_item_id: string | null;
  title: string;
  description: string;
  media_type: 'audio' | 'video' | 'pdf';
  use_cases: string;
  modality: string | null;
  mood_tags: string;
  duration_seconds: number | null;
  r2_key: string;
  public_url: string;
  content_page_url: string | null;
  created_at: string;
  transcript_length: number;
}

/** getLibraryItem/updateLibraryItem return the list shape plus the full transcript. */
export type LibraryItemDetail = LibraryListItem & { transcript: string | null };

/**
 * Everything in the public content library, newest first.
 *
 * "Public library" is exactly the match_content_items definition — client_id IS NULL
 * AND cohort_id IS NULL — so private client recordings and cohort-shared files never
 * appear here.
 *
 * LIMIT 1000 is a safety cap, not pagination: the whole list is fetched once and
 * filtered client-side. Callers should tell the user when the cap is hit, since a
 * silently truncated library defeats the point of the page.
 */
export async function listLibraryItems(): Promise<LibraryListItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, webflow_item_id, title, description, media_type,
           use_cases, modality, mood_tags, duration_seconds,
           r2_key, public_url, content_page_url, created_at,
           COALESCE(length(transcript), 0) AS transcript_length
    FROM content_items
    WHERE client_id IS NULL AND cohort_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1000
  `;
  return rows as LibraryListItem[];
}

/**
 * One public-library item including its full transcript, for the detail panel.
 * The client_id/cohort_id guard means this can never be used to read a private
 * client recording or cohort file by guessing its id.
 */
export async function getLibraryItem(id: string): Promise<LibraryItemDetail | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, webflow_item_id, title, description, media_type,
           use_cases, modality, mood_tags, duration_seconds,
           r2_key, public_url, content_page_url, created_at,
           transcript,
           COALESCE(length(transcript), 0) AS transcript_length
    FROM content_items
    WHERE id = ${id} AND client_id IS NULL AND cohort_id IS NULL
  `;
  return (rows[0] as LibraryItemDetail) ?? null;
}

/**
 * Update a public-library item's metadata and rewrite its embedding in one statement.
 *
 * The embedding is a required argument rather than an optional one on purpose: the
 * editable fields ARE the embedding's source text (see buildEmbeddingText), so a
 * metadata write without a fresh vector would leave search matching on text the
 * dashboard no longer shows — a silent, invisible drift.
 *
 * COALESCE keeps existing values for omitted fields (same idiom as updateEnrollment
 * / updateCohort). modality and duration_seconds are handled with the sql-fragment
 * form instead, because both are legitimately nullable and COALESCE couldn't tell
 * "leave this alone" apart from "clear it".
 */
export async function updateLibraryItem(
  id: string,
  data: {
    title?: string;
    description?: string;
    useCases?: string;
    modality?: string | null;
    moodTags?: string;
    durationSeconds?: number | null;
  },
  embedding: number[],
): Promise<LibraryItemDetail | null> {
  const sql = getSql();
  const embeddingStr = `[${embedding.join(',')}]`;
  const rows = await sql`
    UPDATE content_items SET
      title = COALESCE(${data.title ?? null}, title),
      description = COALESCE(${data.description ?? null}, description),
      use_cases = COALESCE(${data.useCases ?? null}, use_cases),
      mood_tags = COALESCE(${data.moodTags ?? null}, mood_tags),
      modality = ${data.modality === undefined ? sql`modality` : data.modality},
      duration_seconds = ${data.durationSeconds === undefined ? sql`duration_seconds` : data.durationSeconds},
      embedding = ${embeddingStr}::vector
    WHERE id = ${id} AND client_id IS NULL AND cohort_id IS NULL
    RETURNING id, webflow_item_id, title, description, media_type,
              use_cases, modality, mood_tags, duration_seconds,
              r2_key, public_url, content_page_url, created_at,
              transcript,
              COALESCE(length(transcript), 0) AS transcript_length
  `;
  return (rows[0] as LibraryItemDetail) ?? null;
}

// ── Client management (coaching) ─────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  email: string;
  memberstack_id: string | null;
  created_at: string;
}

export interface Enrollment {
  id: string;
  client_id: string;
  program_type: 'individual' | 'cohort';
  goal: string;
  status: 'active' | 'paused' | 'complete';
  total_sessions: number;
  sessions_done: number;
  next_session_at: string | null;
  calendar_url: string;
  created_at: string;
}

export interface SessionLog {
  id: string;
  enrollment_id: string;
  session_date: string;
  notes: string;
  next_actions: string;
  coach_actions: string;
  created_at: string;
}

export async function findClientByEmail(email: string): Promise<Client | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM clients WHERE email = ${email}`;
  return (rows[0] as Client) ?? null;
}

/** Resolve a client from a (trusted) Memberstack member id — for the portal endpoint. */
export async function getClientByMemberstackId(memberstackId: string): Promise<Client | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM clients WHERE memberstack_id = ${memberstackId}`;
  return (rows[0] as Client) ?? null;
}

/**
 * Create a client + their first enrollment. If a client with this email already
 * exists, reuse it and just add a new enrollment ("pack"). Returns the enrollment,
 * the client, and whether the client was reused (for the dedupe UX message).
 */
/** Persist a member id onto a client row (provisioning + later backfill). */
export async function setClientMemberstackId(clientId: string, memberstackId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE clients SET memberstack_id = ${memberstackId} WHERE id = ${clientId}`;
}

/**
 * Warning text for plans that were asked for but never attached because their env id is
 * unset. Worth surfacing loudly: the member exists and can log in, so nothing looks wrong
 * from the dashboard, but the portal gates its panels on the plan — they land on the
 * upsell with none of their content. Silence makes a missing variable read as a
 * Memberstack bug.
 */
function unsetPlanIdWarning(plansSkipped: ('individual' | 'cohort')[]): string | undefined {
  if (plansSkipped.length === 0) return undefined;
  const vars = plansSkipped
    .map((p) => (p === 'individual' ? 'MEMBERSTACK_INDIVIDUAL_PLAN_ID' : 'MEMBERSTACK_COHORT_PLAN_ID'))
    .join(' and ');
  const many = plansSkipped.length > 1;
  return (
    `Saved, but no ${plansSkipped.join(' or ')} plan was attached in Memberstack — ` +
    `${vars} ${many ? 'are' : 'is'} not set, so they can log in but will see the upsell ` +
    `instead of their content. Set ${many ? 'them' : 'it'}, then re-check /reconcile.`
  );
}

/**
 * Ensure a client has a linked Memberstack member AND holds the plan for the program
 * they're being enrolled in, so they can reach the portal.
 *
 * Two cases, because a person's second program matters as much as their first:
 *  - **No member yet** → create one with the plan(s) for `planType` (`provisionMember`
 *    dedupes by email, so an existing member is linked rather than duplicated).
 *  - **Member already exists** → attach any plan `planType` calls for that they don't
 *    already hold. Without this, someone provisioned as individual who later joins a
 *    cohort gets the cohort *enrollment* but never the cohort *plan*, so `portal.js` —
 *    which decides panels from `planConnections` — hides the cohort panel from a genuine
 *    cohort member. That drift is exactly what `/reconcile` reports; closing it here makes
 *    the dashboard authoritative and leaves reconcile as a safety net rather than a
 *    required manual step.
 *
 * Only ever ADDS plans. Revocation stays manual (via /reconcile): dropping a plan because
 * one enrollment ended could cut off a program the person still has, and this function
 * only knows about the program being enrolled — not the rest of their record.
 *
 * Never throws. Provisioning is best-effort by design — Memberstack being down must not
 * block creating a client or an enrollment — so a failure comes back as `provisionWarning`
 * for the UI to surface, and the caller carries on. The DB write is the source of truth.
 *
 * `memberProvisioned` stays true only for a brand-new member id created this request: it's
 * the signal the UI uses to send the welcome/set-password email exactly once. Attaching a
 * plan to an existing member must NOT re-trigger that, so it's reported separately as
 * `plansAttached`.
 */
export async function ensureMemberProvisioned(
  client: Client,
  opts: {
    firstName?: string;
    lastName?: string;
    goal?: string;
    totalSessions?: number;
    planType?: PlanType;
  } = {},
): Promise<{
  client: Client;
  provisionWarning?: string;
  memberProvisioned: boolean;
  /** Plans newly attached to an already-existing member this request. */
  plansAttached: ('individual' | 'cohort')[];
}> {
  const planType = opts.planType ?? 'individual';

  // Already has a member — make sure the plan for THIS program is actually on them.
  if (client.memberstack_id) {
    const { attached, warning } = await ensureMemberPlans(client.memberstack_id, planType);
    return {
      client,
      memberProvisioned: false,
      plansAttached: attached,
      provisionWarning: warning,
    };
  }

  try {
    const { id, plansSkipped } = await provisionMember({
      email: client.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      goal: opts.goal,
      totalSessions: opts.totalSessions,
      planType,
    });
    await setClientMemberstackId(client.id, id);
    return {
      client: { ...client, memberstack_id: id },
      memberProvisioned: true,
      plansAttached: [],
      provisionWarning: unsetPlanIdWarning(plansSkipped),
    };
  } catch (err) {
    return {
      client,
      memberProvisioned: false,
      plansAttached: [],
      provisionWarning: `Client saved, but Memberstack provisioning failed: ${String(err)}`,
    };
  }
}

/**
 * Attach whichever of the two coaching plans `planType` calls for that this member doesn't
 * already hold. Read-then-write, so a plan they already have is never re-added.
 *
 * Bails without touching anything when the member's current plan state can't be read —
 * `getMemberPlanState` returns null for "unknown", and attaching plans against an unknown
 * baseline is how you end up granting access nobody asked for.
 */
async function ensureMemberPlans(
  memberstackId: string,
  planType: PlanType,
): Promise<{ attached: ('individual' | 'cohort')[]; warning?: string }> {
  // An install with no Memberstack key isn't drift — there's simply no portal to gate.
  // Warning on every enrollment there would be noise, so distinguish that from a genuine
  // read failure, which IS worth surfacing.
  if (!isMemberstackConfigured()) return { attached: [] };

  try {
    const state = await getMemberPlanState(memberstackId);
    if (!state) {
      return {
        attached: [],
        warning:
          'Enrollment saved, but their Memberstack plans could not be read — ' +
          'check /reconcile to confirm their portal access.',
      };
    }

    const wanted: ('individual' | 'cohort')[] = [];
    if (planType === 'individual' || planType === 'both') wanted.push('individual');
    if (planType === 'cohort' || planType === 'both') wanted.push('cohort');

    const missing = wanted.filter((p) =>
      p === 'individual' ? !state.hasIndividualPlan : !state.hasCohortPlan,
    );
    if (missing.length === 0) return { attached: [] };

    const attached: ('individual' | 'cohort')[] = [];
    const skipped: ('individual' | 'cohort')[] = [];
    for (const p of missing) {
      // false = that plan id is unset (Memberstack itself is configured — checked above),
      // so nothing was attached. A no-op, but one the operator needs to hear about.
      if (await setMemberPlan(memberstackId, p, true)) attached.push(p);
      else skipped.push(p);
    }
    return { attached, warning: unsetPlanIdWarning(skipped) };
  } catch (err) {
    return {
      attached: [],
      warning: `Enrollment saved, but attaching their Memberstack plan failed: ${String(err)}`,
    };
  }
}

/**
 * Create (or reuse) a client and enrol them in one or both program types.
 *
 * `programType` drives everything: which enrollments get created, and which Memberstack
 * plan(s) the member is provisioned with — a cohort-only person needs the cohort plan or
 * the portal shows them nothing but the upsell.
 *
 * Cohort enrolment is dupe-guarded, so picking a cohort the person is already in adds the
 * individual pack (for 'both') without creating a second cohort row.
 */
export async function createClientWithEnrollment(data: {
  firstName: string;
  lastName: string;
  email: string;
  goal: string;
  totalSessions: number;
  programType?: 'individual' | 'cohort' | 'both';
  cohortId?: string;
}): Promise<{
  client: Client;
  enrollment: Enrollment | null;
  cohortEnrollment?: Enrollment | null;
  reusedClient: boolean;
  alreadyMember?: boolean;
  provisionWarning?: string;
  memberProvisioned: boolean;
  /** Plans newly attached to an already-existing member (reused client). */
  plansAttached: ('individual' | 'cohort')[];
}> {
  const sql = getSql();
  const existing = await findClientByEmail(data.email);

  // Our clients table stores a single display name; keep that as "First Last" (trimmed).
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();

  let client: Client;
  let reusedClient: boolean;
  if (existing) {
    client = existing;
    reusedClient = true;
  } else {
    const rows = await sql`
      INSERT INTO clients (name, email) VALUES (${fullName}, ${data.email})
      RETURNING *`;
    client = rows[0] as Client;
    reusedClient = false;
  }

  const programType = data.programType ?? 'individual';
  const wantsIndividual = programType === 'individual' || programType === 'both';
  const wantsCohort = programType === 'cohort' || programType === 'both';

  const enrollment = wantsIndividual
    ? await addEnrollment(client.id, { goal: data.goal, totalSessions: data.totalSessions })
    : null;

  let cohortEnrollment: Enrollment | null = null;
  let alreadyMember = false;
  if (wantsCohort && data.cohortId) {
    if (await isCohortMember(client.id, data.cohortId)) {
      alreadyMember = true;
    } else {
      cohortEnrollment = await addCohortEnrollment(client.id, data.cohortId, data.goal);
    }
  }

  // Provision (or link) a Memberstack member so the client can access the portal.
  //
  // Deliberately AFTER the enrollment writes, and keyed to the enrollments that actually
  // exist rather than to `programType`: granting a plan for a program they didn't end up
  // enrolled in would show them an empty panel and register as drift in /reconcile. An
  // `alreadyMember` cohort still counts — they hold that enrollment, it just predates
  // this request.
  //
  // `memberProvisioned` is true only when a brand-new member id was created and stored
  // this request — the signal the UI uses to send the welcome/set-password email exactly
  // once (not on reuse or re-save).
  const enrolledIndividual = enrollment !== null;
  const enrolledCohort = cohortEnrollment !== null || alreadyMember;
  const planType: PlanType | null =
    enrolledIndividual && enrolledCohort
      ? 'both'
      : enrolledIndividual
        ? 'individual'
        : enrolledCohort
          ? 'cohort'
          : null;

  // No enrollment landed (cohort requested but the id was missing) — nothing to entitle.
  const provisioned = planType
    ? await ensureMemberProvisioned(client, {
        firstName: data.firstName,
        lastName: data.lastName,
        goal: data.goal,
        totalSessions: data.totalSessions,
        planType,
      })
    : { client, memberProvisioned: false, plansAttached: [], provisionWarning: undefined };

  client = provisioned.client;
  const provisionWarning = provisioned.provisionWarning;
  const memberProvisioned = provisioned.memberProvisioned;

  return {
    client,
    enrollment,
    cohortEnrollment,
    reusedClient,
    alreadyMember,
    provisionWarning,
    memberProvisioned,
    plansAttached: provisioned.plansAttached,
  };
}

export async function addEnrollment(
  clientId: string,
  data: { goal?: string; totalSessions?: number; programType?: 'individual' | 'cohort' },
): Promise<Enrollment> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO enrollments (client_id, program_type, goal, total_sessions)
    VALUES (${clientId}, ${data.programType ?? 'individual'},
            ${data.goal ?? ''}, ${data.totalSessions ?? 6})
    RETURNING *`;
  return rows[0] as Enrollment;
}


/** One enrollment as it appears nested inside a ClientListRow. */
export interface ClientListEnrollment {
  id: string;
  program_type: 'individual' | 'cohort';
  goal: string;
  status: 'active' | 'paused' | 'complete';
  total_sessions: number;
  sessions_done: number;
  cohort_id: string | null;
  cohort_name: string | null;
  last_session_at: string | null;
}

/** A person, with every program they're enrolled in. One row per human. */
export interface ClientListRow {
  id: string;
  name: string;
  email: string;
  any_active: boolean;
  program_types: ('individual' | 'cohort')[];
  enrollments: ClientListEnrollment[];
}

/**
 * The Clients list, grained by PERSON rather than by enrollment.
 *
 * This replaced an enrollment-grained query that returned one row per enrollment, so
 * somebody with an individual pack and a cohort place appeared twice — two rows, same
 * name, both linking to the same client. Aggregating here means the list matches how
 * Lindsay thinks about her clients: one human, expandable to the programs they're in.
 *
 * `statusFilter` keeps a person if ANY of their enrollments matches, but the nested
 * enrollments array is filtered to match too — otherwise "active" would expand to reveal
 * completed packs. Done as two whole queries because Neon's tagged-template driver can't
 * concatenate SQL fragments (same reason listCohorts branches this way).
 */
export async function listClientsWithEnrollments(statusFilter?: string): Promise<ClientListRow[]> {
  const sql = getSql();
  const rows = statusFilter
    ? await sql`
        SELECT c.id, c.name, c.email,
               bool_or(e.status = 'active') AS any_active,
               array_agg(DISTINCT e.program_type) AS program_types,
               json_agg(json_build_object(
                 'id', e.id, 'program_type', e.program_type, 'goal', e.goal,
                 'status', e.status, 'total_sessions', e.total_sessions,
                 'sessions_done', e.sessions_done, 'cohort_id', e.cohort_id,
                 'cohort_name', co.name,
                 'last_session_at', (SELECT max(sl.session_date) FROM session_logs sl WHERE sl.enrollment_id = e.id)
               ) ORDER BY e.created_at DESC) AS enrollments
        FROM clients c
        JOIN enrollments e ON e.client_id = c.id
        LEFT JOIN cohorts co ON co.id = e.cohort_id
        WHERE e.status = ${statusFilter}
        GROUP BY c.id, c.name, c.email
        ORDER BY max(e.created_at) DESC`
    : await sql`
        SELECT c.id, c.name, c.email,
               bool_or(e.status = 'active') AS any_active,
               array_agg(DISTINCT e.program_type) AS program_types,
               json_agg(json_build_object(
                 'id', e.id, 'program_type', e.program_type, 'goal', e.goal,
                 'status', e.status, 'total_sessions', e.total_sessions,
                 'sessions_done', e.sessions_done, 'cohort_id', e.cohort_id,
                 'cohort_name', co.name,
                 'last_session_at', (SELECT max(sl.session_date) FROM session_logs sl WHERE sl.enrollment_id = e.id)
               ) ORDER BY e.created_at DESC) AS enrollments
        FROM clients c
        JOIN enrollments e ON e.client_id = c.id
        LEFT JOIN cohorts co ON co.id = e.cohort_id
        GROUP BY c.id, c.name, c.email
        ORDER BY max(e.created_at) DESC`;
  return rows as ClientListRow[];
}

/** Minimal client list for the cohort roster's existing-person picker. */
export async function listClientsForPicker(): Promise<Pick<Client, 'id' | 'name' | 'email'>[]> {
  const sql = getSql();
  const rows = await sql`SELECT id, name, email FROM clients ORDER BY name`;
  return rows as Pick<Client, 'id' | 'name' | 'email'>[];
}

export async function getClientWithEnrollments(
  clientId: string,
): Promise<{ client: Client; enrollments: Enrollment[] } | null> {
  const sql = getSql();
  const clientRows = await sql`SELECT * FROM clients WHERE id = ${clientId}`;
  if (!clientRows[0]) return null;
  const enrollments = await sql`
    SELECT * FROM enrollments WHERE client_id = ${clientId} ORDER BY created_at DESC`;
  return { client: clientRows[0] as Client, enrollments: enrollments as Enrollment[] };
}

export async function getEnrollment(id: string): Promise<Enrollment | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM enrollments WHERE id = ${id}`;
  return (rows[0] as Enrollment) ?? null;
}

/**
 * Delete a client and everything under them. Enrollments + their session_logs cascade
 * automatically (ON DELETE CASCADE). The client's private recordings live in
 * content_items.client_id, which has NO cascade — so we detach those rows first to avoid
 * a foreign-key violation (the underlying R2 objects are left as-is; this is DB cleanup).
 * Does NOT touch the Memberstack member — that's removed manually in the Memberstack
 * dashboard if you want to fully free the email for re-provisioning.
 * Returns false if no such client existed.
 */
export async function deleteClient(clientId: string): Promise<boolean> {
  const sql = getSql();
  const existing = await sql`SELECT id FROM clients WHERE id = ${clientId}`;
  if (!existing[0]) return false;
  // Detach private recordings/content from this client (no cascade on content_items).
  await sql`UPDATE content_items SET client_id = NULL WHERE client_id = ${clientId}`;
  // Enrollments + session_logs cascade from the client delete.
  await sql`DELETE FROM clients WHERE id = ${clientId}`;
  return true;
}

export async function updateEnrollment(
  id: string,
  data: { goal?: string; status?: string; nextSessionAt?: string | null; totalSessions?: number; calendarUrl?: string },
): Promise<Enrollment | null> {
  const sql = getSql();
  // COALESCE keeps existing values when a field isn't provided. next_session_at is
  // handled separately so it can be explicitly cleared to null.
  const rows = await sql`
    UPDATE enrollments SET
      goal = COALESCE(${data.goal ?? null}, goal),
      status = COALESCE(${data.status ?? null}, status),
      total_sessions = COALESCE(${data.totalSessions ?? null}, total_sessions),
      calendar_url = COALESCE(${data.calendarUrl ?? null}, calendar_url),
      next_session_at = ${data.nextSessionAt === undefined ? sql`next_session_at` : data.nextSessionAt}
    WHERE id = ${id}
    RETURNING *`;
  return (rows[0] as Enrollment) ?? null;
}

/** Add a session log and increment the enrollment's counter atomically. */
export async function addSessionLog(
  enrollmentId: string,
  data: { notes: string; nextActions: string; coachActions: string; sessionDate?: string },
): Promise<{ log: SessionLog; enrollment: Enrollment }> {
  const sql = getSql();
  const [logRows, enrollRows] = await sql.transaction([
    sql`INSERT INTO session_logs (enrollment_id, notes, next_actions, coach_actions, session_date)
        VALUES (${enrollmentId}, ${data.notes}, ${data.nextActions}, ${data.coachActions},
                ${data.sessionDate ?? new Date().toISOString()})
        RETURNING *`,
    sql`UPDATE enrollments SET sessions_done = sessions_done + 1
        WHERE id = ${enrollmentId} RETURNING *`,
  ]);
  return { log: logRows[0] as SessionLog, enrollment: enrollRows[0] as Enrollment };
}

export async function getSessionLogs(enrollmentId: string): Promise<SessionLog[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM session_logs WHERE enrollment_id = ${enrollmentId}
    ORDER BY session_date DESC`;
  return rows as SessionLog[];
}

export async function getClientRecordings(clientId: string): Promise<ContentItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM content_items WHERE client_id = ${clientId} ORDER BY created_at DESC`;
  return rows as ContentItem[];
}

/** Client content rows of one kind (recording = Zoom sessions, file = delivered assets). */
export async function getClientContentByKind(
  clientId: string,
  kind: 'recording' | 'file',
): Promise<ContentItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM content_items
    WHERE client_id = ${clientId} AND kind = ${kind}
    ORDER BY created_at DESC`;
  return rows as ContentItem[];
}

/** A single private client recording by id (only rows scoped to a client). */
/**
 * A single enrollment's content — the per-program view of getClientContentByKind.
 *
 * Content is scoped by `program_id` (which holds the enrollment id) as well as client, so
 * an individual pack's recordings don't bleed into the cohort tab and vice versa. Uploads
 * have set program_id since the client-content feature shipped; verified 2026-07-31 that
 * no legacy client rows are missing it, so no backfill is needed.
 */
export async function getEnrollmentContentByKind(
  enrollmentId: string,
  clientId: string,
  kind: 'recording' | 'file',
): Promise<ContentItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM content_items
    WHERE client_id = ${clientId} AND program_id = ${enrollmentId} AND kind = ${kind}
    ORDER BY created_at DESC`;
  return rows as ContentItem[];
}

export async function getClientRecording(id: string): Promise<ContentItem | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM content_items WHERE id = ${id} AND client_id IS NOT NULL`;
  return (rows[0] as ContentItem) ?? null;
}

/**
 * Delete a private client recording row. Returns the deleted row (so the caller can
 * remove the underlying R2 object), or null if no matching client recording existed.
 * Guarded to client_id IS NOT NULL so this can never delete public library content.
 */
export async function deleteClientRecording(id: string): Promise<ContentItem | null> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM content_items WHERE id = ${id} AND client_id IS NOT NULL RETURNING *`;
  return (rows[0] as ContentItem) ?? null;
}

/**
 * Insert a private client recording from a pasted R2 link (no upload/transcription).
 * Client recordings are excluded from library search (match_content_items filters
 * client_id IS NULL), so the embedding is never used — we store a zero vector to
 * satisfy the NOT NULL column rather than spend an embedding call on it.
 */
export async function insertClientRecording(data: {
  title: string;
  clientId: string;
  enrollmentId: string | null;
  sessionLabel: string | null;
  mediaType: 'audio' | 'video' | 'pdf';
  r2Key: string;
  publicUrl: string;
  kind?: 'recording' | 'file';
  description?: string;
}): Promise<string> {
  const sql = getSql();
  const zeroVec = `[${new Array(1024).fill(0).join(',')}]`;
  const rows = await sql`
    INSERT INTO content_items
      (title, description, media_type, use_cases, mood_tags,
       r2_key, public_url, embedding, client_id, downloadable, session_label, program_id, kind)
    VALUES
      (${data.title}, ${data.description ?? ''}, ${data.mediaType}, '', '',
       ${data.r2Key}, ${data.publicUrl}, ${zeroVec}::vector,
       ${data.clientId}, true, ${data.sessionLabel}, ${data.enrollmentId}, ${data.kind ?? 'recording'})
    RETURNING id`;
  return rows[0].id as string;
}

/** Tag an existing content_items row as a private downloadable recording/file for a client. */
export async function attachRecordingToClient(
  contentId: string,
  data: {
    clientId: string;
    sessionLabel: string | null;
    enrollmentId?: string | null;
    kind?: 'recording' | 'file';
    description?: string;
  },
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE content_items
    SET client_id = ${data.clientId}, downloadable = true,
        session_label = ${data.sessionLabel}, program_id = ${data.enrollmentId ?? null},
        kind = ${data.kind ?? 'recording'},
        description = COALESCE(${data.description ?? null}, description)
    WHERE id = ${contentId}`;
}

// ── Cohorts (group programs) ─────────────────────────────────────────────────

export interface Cohort {
  id: string;
  name: string;
  description: string;
  goal: string;
  total_sessions: number;
  current_session: number;
  status: 'active' | 'complete' | 'archived';
  zoom_url: string;
  telegram_url: string;
  start_date: string | null;
  end_date: string | null;
  session_cadence: 'weekly' | 'biweekly';
  created_at: string;
}

export interface CohortSession {
  id: string;
  cohort_id: string;
  session_date: string | null;
  title: string;
  prompt_text: string;
  sort_order: number;
  created_at: string;
}

// Roster row: a cohort member's enrollment joined with their client info.
export interface CohortMember {
  enrollment_id: string;
  client_id: string;
  client_name: string;
  client_email: string;
  goal: string;
  status: 'active' | 'paused' | 'complete';
}

export interface CohortListRow extends Cohort {
  member_count: number;
}

export async function listCohorts(statusFilter?: string): Promise<CohortListRow[]> {
  const sql = getSql();
  const rows = statusFilter
    ? await sql`
        SELECT c.*, (SELECT count(*)::int FROM enrollments e WHERE e.cohort_id = c.id) AS member_count
        FROM cohorts c WHERE c.status = ${statusFilter} ORDER BY c.created_at DESC`
    : await sql`
        SELECT c.*, (SELECT count(*)::int FROM enrollments e WHERE e.cohort_id = c.id) AS member_count
        FROM cohorts c ORDER BY c.created_at DESC`;
  return rows as CohortListRow[];
}

export async function createCohort(data: {
  name: string;
  description?: string;
  goal?: string;
  totalSessions?: number;
  telegramUrl?: string;
  startDate?: string | null;
  endDate?: string | null;
  sessionCadence?: 'weekly' | 'biweekly';
}): Promise<Cohort> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO cohorts (name, description, goal, total_sessions, telegram_url, start_date, end_date, session_cadence)
    VALUES (${data.name}, ${data.description ?? ''}, ${data.goal ?? ''}, ${data.totalSessions ?? 4},
            ${data.telegramUrl ?? ''}, ${data.startDate ?? null}, ${data.endDate ?? null},
            ${data.sessionCadence ?? 'weekly'})
    RETURNING *`;
  return rows[0] as Cohort;
}

export async function getCohort(id: string): Promise<Cohort | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM cohorts WHERE id = ${id}`;
  return (rows[0] as Cohort) ?? null;
}

export async function getCohortRoster(cohortId: string): Promise<CohortMember[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT e.id AS enrollment_id, e.goal, e.status,
           c.id AS client_id, c.name AS client_name, c.email AS client_email
    FROM enrollments e JOIN clients c ON c.id = e.client_id
    WHERE e.cohort_id = ${cohortId}
    ORDER BY c.name`;
  return rows as CohortMember[];
}

export async function updateCohort(
  id: string,
  data: {
    name?: string;
    description?: string;
    goal?: string;
    status?: string;
    totalSessions?: number;
    currentSession?: number;
    zoomUrl?: string;
    telegramUrl?: string;
    startDate?: string | null;
    endDate?: string | null;
    sessionCadence?: 'weekly' | 'biweekly';
  },
): Promise<Cohort | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE cohorts SET
      name = COALESCE(${data.name ?? null}, name),
      description = COALESCE(${data.description ?? null}, description),
      goal = COALESCE(${data.goal ?? null}, goal),
      status = COALESCE(${data.status ?? null}, status),
      total_sessions = COALESCE(${data.totalSessions ?? null}, total_sessions),
      current_session = COALESCE(${data.currentSession ?? null}, current_session),
      zoom_url = COALESCE(${data.zoomUrl ?? null}, zoom_url),
      telegram_url = COALESCE(${data.telegramUrl ?? null}, telegram_url),
      start_date = ${data.startDate === undefined ? sql`start_date` : data.startDate},
      end_date = ${data.endDate === undefined ? sql`end_date` : data.endDate},
      session_cadence = COALESCE(${data.sessionCadence ?? null}, session_cadence)
    WHERE id = ${id}
    RETURNING *`;
  return (rows[0] as Cohort) ?? null;
}

export async function getCohortSessions(cohortId: string): Promise<CohortSession[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM cohort_sessions WHERE cohort_id = ${cohortId}
    ORDER BY sort_order, session_date NULLS LAST, created_at`;
  return rows as CohortSession[];
}

export async function addCohortSession(
  cohortId: string,
  data: { title: string; sessionDate: string | null; sortOrder?: number; promptText?: string },
): Promise<CohortSession> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO cohort_sessions (cohort_id, title, session_date, sort_order, prompt_text)
    VALUES (${cohortId}, ${data.title}, ${data.sessionDate}, ${data.sortOrder ?? 0}, ${data.promptText ?? ''})
    RETURNING *`;
  return rows[0] as CohortSession;
}

export async function updateCohortSession(
  id: string,
  data: { title?: string; sessionDate?: string | null; sortOrder?: number; promptText?: string },
): Promise<CohortSession | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE cohort_sessions SET
      title = COALESCE(${data.title ?? null}, title),
      session_date = ${data.sessionDate === undefined ? sql`session_date` : data.sessionDate},
      sort_order = COALESCE(${data.sortOrder ?? null}, sort_order),
      prompt_text = COALESCE(${data.promptText ?? null}, prompt_text)
    WHERE id = ${id}
    RETURNING *`;
  return (rows[0] as CohortSession) ?? null;
}

/**
 * Auto-plot a cohort's schedule: generate `totalSessions` dated rows starting at
 * `startDate`, spaced by cadence (weekly = 7d, biweekly = 14d). Each row is editable
 * afterward (holiday shifts) via updateCohortSession. Bulk-inserted in one statement.
 *
 * `replaceExisting` deletes the cohort's current rows first, inside the same transaction —
 * used when re-plotting a schedule so the coach doesn't end up with two overlapping sets.
 * Off by default: deleting dated rows also orphans any content_items attached to them
 * (cohort_session_id points at rows that no longer exist), so it must be an explicit,
 * informed choice rather than a silent side-effect of pressing Generate twice.
 *
 * Spacing is computed in LOCAL time, not UTC. Using setUTCDate shifts the wall-clock time
 * of every session after a DST boundary — a 7pm class becomes 6pm or 8pm halfway through
 * the program — because a "week later" in UTC is not a week later on the clock a member
 * reads. setDate does the arithmetic in the server's local zone, which keeps the hour
 * stable across the transition.
 */
export async function generateCohortSchedule(
  cohortId: string,
  data: {
    startDate: string;
    cadence: 'weekly' | 'biweekly';
    totalSessions: number;
    replaceExisting?: boolean;
  },
): Promise<CohortSession[]> {
  const sql = getSql();
  const stepDays = data.cadence === 'biweekly' ? 14 : 7;
  const base = new Date(data.startDate);
  // title is left blank on auto-generate — the coach names sessions afterward, and both
  // dashboard and portal fall back to "Session {n}" (the auto badge) when title is empty.
  const rows: { date: string; sort: number }[] = [];
  for (let n = 1; n <= data.totalSessions; n++) {
    const d = new Date(base);
    d.setDate(d.getDate() + stepDays * (n - 1));
    rows.push({ date: d.toISOString(), sort: n });
  }

  const statements = [
    ...(data.replaceExisting
      ? [sql`DELETE FROM cohort_sessions WHERE cohort_id = ${cohortId}`]
      : []),
    ...rows.map(
      (r) => sql`
        INSERT INTO cohort_sessions (cohort_id, title, session_date, sort_order)
        VALUES (${cohortId}, '', ${r.date}, ${r.sort})
        RETURNING *`,
    ),
  ];

  const results = await sql.transaction(statements);
  // Drop the DELETE's result when present, so the return value is always the new rows.
  const insertResults = data.replaceExisting ? results.slice(1) : results;
  return insertResults.map((res) => res[0] as CohortSession);
}

export async function deleteCohortSession(id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM cohort_sessions WHERE id = ${id}`;
}

/**
 * Create a cohort enrollment. Separate from addEnrollment because that one has no
 * cohort_id parameter, and a cohort enrollment carries no session count of its own —
 * progress belongs to the cohort, so total_sessions stays 0.
 */
export async function addCohortEnrollment(
  clientId: string,
  cohortId: string,
  goal: string,
): Promise<Enrollment> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO enrollments (client_id, program_type, cohort_id, goal, total_sessions)
    VALUES (${clientId}, 'cohort', ${cohortId}, ${goal}, 0)
    RETURNING *`;
  return rows[0] as Enrollment;
}

/** Is this client already enrolled in this cohort? */
export async function isCohortMember(clientId: string, cohortId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM enrollments WHERE client_id = ${clientId} AND cohort_id = ${cohortId} LIMIT 1`;
  return rows.length > 0;
}

/**
 * Add someone to a cohort, either by picking an existing client (`clientId`) or by
 * name + email.
 *
 * Three things this now does that the free-text version didn't:
 *  - resolves an existing person first, so adding a current 1:1 client to a cohort
 *    reuses their record instead of creating a second one;
 *  - refuses to enrol the same person twice (`alreadyMember`);
 *  - provisions Memberstack, so a cohort-only person can actually reach the portal —
 *    previously only the individual create path did this, leaving them locked out.
 */
export async function addCohortMember(data: {
  cohortId: string;
  clientId?: string;
  name?: string;
  email?: string;
  goal: string;
}): Promise<{
  client: Client;
  enrollment: Enrollment | null;
  reusedClient: boolean;
  alreadyMember: boolean;
  provisionWarning?: string;
  memberProvisioned: boolean;
  /** Plans newly attached to an already-existing member (reused client). */
  plansAttached: ('individual' | 'cohort')[];
}> {
  const sql = getSql();

  // Resolve the person: explicit pick → existing email → create.
  let client: Client | null = null;
  let reusedClient = false;

  if (data.clientId) {
    const rows = await sql`SELECT * FROM clients WHERE id = ${data.clientId}`;
    client = (rows[0] as Client) ?? null;
    if (!client) throw new Error('Client not found');
    reusedClient = true;
  } else {
    if (!data.email || !data.name) throw new Error('Provide either clientId, or name + email');
    const existing = await findClientByEmail(data.email);
    if (existing) {
      client = existing;
      reusedClient = true;
    } else {
      const rows = await sql`
        INSERT INTO clients (name, email) VALUES (${data.name}, ${data.email}) RETURNING *`;
      client = rows[0] as Client;
    }
  }

  if (await isCohortMember(client.id, data.cohortId)) {
    return {
      client,
      enrollment: null,
      reusedClient,
      alreadyMember: true,
      memberProvisioned: false,
      plansAttached: [],
    };
  }

  const provisioned = await ensureMemberProvisioned(client, {
    firstName: client.name.split(' ')[0],
    lastName: client.name.split(' ').slice(1).join(' ') || undefined,
    goal: data.goal,
    planType: 'cohort',
  });
  client = provisioned.client;

  const enrollment = await addCohortEnrollment(client.id, data.cohortId, data.goal);
  return {
    client,
    enrollment,
    reusedClient,
    alreadyMember: false,
    provisionWarning: provisioned.provisionWarning,
    memberProvisioned: provisioned.memberProvisioned,
    plansAttached: provisioned.plansAttached,
  };
}

/**
 * Remove someone from a cohort by deleting their cohort enrollment.
 *
 * Deliberately narrow: scoped to `program_type = 'cohort'` and the given cohort, so this
 * can never delete an individual pack. The person's client record and any other
 * enrollments are untouched, and their Memberstack plan is left alone — the dashboard
 * owns enrollment, not plan state, and revoking a plan here could lock someone out of an
 * individual pack they still have.
 *
 * Content uploaded against the cohort stays on the cohort (it belongs to the group, not
 * the departing member); anything scoped to them personally keeps its client_id and
 * simply stops being reachable through this cohort.
 *
 * Returns the deleted enrollment, or null if they weren't a member.
 */
export async function removeCohortMember(
  cohortId: string,
  enrollmentId: string,
): Promise<Enrollment | null> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM enrollments
    WHERE id = ${enrollmentId}
      AND cohort_id = ${cohortId}
      AND program_type = 'cohort'
    RETURNING *`;
  return (rows[0] as Enrollment) ?? null;
}

/** What the dashboard says a person should be entitled to, derived from enrollments. */
export interface ClientEntitlement {
  client_id: string;
  name: string;
  email: string;
  memberstack_id: string | null;
  /** Has at least one non-complete individual enrollment. */
  wantsIndividual: boolean;
  /** Has at least one non-complete cohort enrollment. */
  wantsCohort: boolean;
}

/**
 * Every client with the plans their enrollments imply — the dashboard half of
 * reconciliation against Memberstack.
 *
 * 'complete' enrollments are excluded deliberately: a finished pack shouldn't keep
 * granting portal access, so a member still holding that plan is real drift worth
 * surfacing. Paused DOES still count as entitled — a pause is temporary, and revoking
 * access mid-pause would be wrong.
 */
export async function listClientEntitlements(): Promise<ClientEntitlement[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      c.id AS client_id, c.name, c.email, c.memberstack_id,
      COALESCE(bool_or(e.program_type = 'individual' AND e.status <> 'complete'), false) AS "wantsIndividual",
      COALESCE(bool_or(e.program_type = 'cohort'     AND e.status <> 'complete'), false) AS "wantsCohort"
    FROM clients c
    LEFT JOIN enrollments e ON e.client_id = c.id
    GROUP BY c.id, c.name, c.email, c.memberstack_id
    ORDER BY c.name`;
  return rows as ClientEntitlement[];
}

/**
 * Cohorts a given person could join: active only, minus the ones they're already in.
 * Feeds the "Join a cohort" picker on the client detail page — the cohort counterpart of
 * the existing-client picker used when adding members from the cohort side.
 */
export async function getJoinableCohorts(clientId: string): Promise<Cohort[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM cohorts c
    WHERE c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.cohort_id = c.id AND e.client_id = ${clientId}
      )
    ORDER BY c.created_at DESC`;
  return rows as Cohort[];
}

export async function getCohortContent(cohortId: string): Promise<ContentItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM content_items WHERE cohort_id = ${cohortId} ORDER BY created_at DESC`;
  return rows as ContentItem[];
}

/** Create a cohort content row from a pasted/uploaded R2 link (zero-vector; never searched).
 *
 *  Scope is set by which optional column you pass — the same three shapes the portal reads
 *  back (db/schema.sql:135-143):
 *    cohortSessionId → that session's files, shown inside the session card
 *    neither         → cohort-wide, every member sees it
 *    clientId        → private to that member within the cohort (the portal's `my_files`)
 *
 *  The zero vector keeps these rows out of search: match_content_items already excludes
 *  anything with a cohort_id, and a zero vector can never match regardless. */
export async function insertCohortContent(data: {
  title: string;
  cohortId: string;
  mediaType: 'audio' | 'video' | 'pdf';
  r2Key: string;
  publicUrl: string;
  cohortSessionId?: string | null;
  clientId?: string | null;
}): Promise<string> {
  const sql = getSql();
  const zeroVec = `[${new Array(1024).fill(0).join(',')}]`;
  const rows = await sql`
    INSERT INTO content_items
      (title, description, media_type, use_cases, mood_tags,
       r2_key, public_url, embedding, cohort_id, cohort_session_id, client_id, downloadable)
    VALUES
      (${data.title}, '', ${data.mediaType}, '', '',
       ${data.r2Key}, ${data.publicUrl}, ${zeroVec}::vector, ${data.cohortId},
       ${data.cohortSessionId ?? null}, ${data.clientId ?? null}, true)
    RETURNING id`;
  return rows[0].id as string;
}

// Cohort enrollment lookup for the cohort-aware member view (joins the cohort).
export async function getCohortForEnrollment(enrollmentId: string): Promise<Cohort | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT c.* FROM cohorts c
    JOIN enrollments e ON e.cohort_id = c.id
    WHERE e.id = ${enrollmentId}`;
  return (rows[0] as Cohort) ?? null;
}

/**
 * Portal-shaped cohort payload for a member: the member's single active cohort (the
 * active program_type='cohort' enrollment; most recent as tiebreak), its dated sessions
 * with prompts, each session's files, and the member's own cohort goal. Returns null if
 * the member has no cohort enrollment. Raw rows — the route presigns file r2_keys and
 * applies the portal-safe projection (mirrors the individual portal path).
 */
export async function getCohortForPortal(memberstackId: string): Promise<{
  cohort: Cohort;
  memberGoal: string;
  sessions: CohortSession[];
  filesBySession: Map<string, ContentItem[]>;
  cohortFiles: ContentItem[];
  myFiles: ContentItem[];
} | null> {
  const sql = getSql();
  // Pick the member's cohort enrollment: active first, else most recent.
  const enrollRows = await sql`
    SELECT e.cohort_id, e.goal, e.status, e.created_at, e.client_id
    FROM enrollments e JOIN clients c ON c.id = e.client_id
    WHERE c.memberstack_id = ${memberstackId} AND e.cohort_id IS NOT NULL
    ORDER BY (e.status = 'active') DESC, e.created_at DESC
    LIMIT 1`;
  if (!enrollRows[0]) return null;
  const cohortId = enrollRows[0].cohort_id as string;
  const memberGoal = enrollRows[0].goal as string;
  const clientId = enrollRows[0].client_id as string;

  const cohort = await getCohort(cohortId);
  if (!cohort) return null;

  const sessions = await getCohortSessions(cohortId);

  // Three cohort content shapes, distinguished by which columns are set:
  //   cohort_session_id set              → that session's files (grouped per session)
  //   no session, client_id NULL         → cohort-wide files, everyone in the cohort sees them
  //   no session, client_id = the member → private to this member within the cohort
  const [sessionFileRows, cohortFileRows, myFileRows] = await Promise.all([
    sql`SELECT * FROM content_items
        WHERE cohort_id = ${cohortId} AND cohort_session_id IS NOT NULL
        ORDER BY created_at DESC`,
    sql`SELECT * FROM content_items
        WHERE cohort_id = ${cohortId} AND cohort_session_id IS NULL AND client_id IS NULL
        ORDER BY created_at DESC`,
    sql`SELECT * FROM content_items
        WHERE cohort_id = ${cohortId} AND cohort_session_id IS NULL AND client_id = ${clientId}
        ORDER BY created_at DESC`,
  ]);

  const filesBySession = new Map<string, ContentItem[]>();
  for (const f of sessionFileRows as ContentItem[]) {
    const key = f.cohort_session_id as string;
    const arr = filesBySession.get(key) ?? [];
    arr.push(f);
    filesBySession.set(key, arr);
  }

  return {
    cohort,
    memberGoal,
    sessions,
    filesBySession,
    cohortFiles: cohortFileRows as ContentItem[],
    myFiles: myFileRows as ContentItem[],
  };
}
