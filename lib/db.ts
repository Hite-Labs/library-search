import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { env } from './env';
import { provisionMember } from './memberstack';

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

// Row for the clients list view: one enrollment joined with its client + last-session date.
export interface EnrollmentListRow extends Enrollment {
  client_name: string;
  client_email: string;
  last_session_at: string | null;
}

export async function findClientByEmail(email: string): Promise<Client | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM clients WHERE email = ${email}`;
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

export async function createClientWithEnrollment(data: {
  name: string;
  email: string;
  goal: string;
  totalSessions: number;
}): Promise<{ client: Client; enrollment: Enrollment; reusedClient: boolean; provisionWarning?: string }> {
  const sql = getSql();
  const existing = await findClientByEmail(data.email);

  let client: Client;
  let reusedClient: boolean;
  if (existing) {
    client = existing;
    reusedClient = true;
  } else {
    const rows = await sql`
      INSERT INTO clients (name, email) VALUES (${data.name}, ${data.email})
      RETURNING *`;
    client = rows[0] as Client;
    reusedClient = false;
  }

  // Provision (or link) a Memberstack member so the client can access the portal.
  // Never block client creation on this — if Memberstack is down, save anyway and
  // surface a warning so Lindsay can retry later. Only call out when we don't yet
  // have an id stored (new client, or an older client created before this wiring).
  let provisionWarning: string | undefined;
  if (!client.memberstack_id) {
    try {
      const { id } = await provisionMember({ email: data.email });
      await setClientMemberstackId(client.id, id);
      client = { ...client, memberstack_id: id };
    } catch (err) {
      provisionWarning = `Client saved, but Memberstack provisioning failed: ${String(err)}`;
    }
  }

  const enrollment = await addEnrollment(client.id, {
    goal: data.goal,
    totalSessions: data.totalSessions,
  });
  return { client, enrollment, reusedClient, provisionWarning };
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

export async function listEnrollments(statusFilter?: string): Promise<EnrollmentListRow[]> {
  const sql = getSql();
  const rows = statusFilter
    ? await sql`
        SELECT e.*, c.name AS client_name, c.email AS client_email,
               (SELECT max(sl.session_date) FROM session_logs sl WHERE sl.enrollment_id = e.id) AS last_session_at
        FROM enrollments e JOIN clients c ON c.id = e.client_id
        WHERE e.status = ${statusFilter}
        ORDER BY e.created_at DESC`
    : await sql`
        SELECT e.*, c.name AS client_name, c.email AS client_email,
               (SELECT max(sl.session_date) FROM session_logs sl WHERE sl.enrollment_id = e.id) AS last_session_at
        FROM enrollments e JOIN clients c ON c.id = e.client_id
        ORDER BY e.created_at DESC`;
  return rows as EnrollmentListRow[];
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
}): Promise<string> {
  const sql = getSql();
  const zeroVec = `[${new Array(1024).fill(0).join(',')}]`;
  const rows = await sql`
    INSERT INTO content_items
      (title, description, media_type, use_cases, mood_tags,
       r2_key, public_url, embedding, client_id, downloadable, session_label, program_id)
    VALUES
      (${data.title}, '', ${data.mediaType}, '', '',
       ${data.r2Key}, ${data.publicUrl}, ${zeroVec}::vector,
       ${data.clientId}, true, ${data.sessionLabel}, ${data.enrollmentId})
    RETURNING id`;
  return rows[0].id as string;
}

/** Tag an existing content_items row as a private downloadable recording for a client. */
export async function attachRecordingToClient(
  contentId: string,
  data: { clientId: string; sessionLabel: string | null; enrollmentId?: string | null },
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE content_items
    SET client_id = ${data.clientId}, downloadable = true,
        session_label = ${data.sessionLabel}, program_id = ${data.enrollmentId ?? null}
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
  created_at: string;
}

export interface CohortSession {
  id: string;
  cohort_id: string;
  session_date: string | null;
  label: string;
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
}): Promise<Cohort> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO cohorts (name, description, goal, total_sessions)
    VALUES (${data.name}, ${data.description ?? ''}, ${data.goal ?? ''}, ${data.totalSessions ?? 4})
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
      zoom_url = COALESCE(${data.zoomUrl ?? null}, zoom_url)
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
  data: { label: string; sessionDate: string | null; sortOrder?: number },
): Promise<CohortSession> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO cohort_sessions (cohort_id, label, session_date, sort_order)
    VALUES (${cohortId}, ${data.label}, ${data.sessionDate}, ${data.sortOrder ?? 0})
    RETURNING *`;
  return rows[0] as CohortSession;
}

export async function updateCohortSession(
  id: string,
  data: { label?: string; sessionDate?: string | null; sortOrder?: number },
): Promise<CohortSession | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE cohort_sessions SET
      label = COALESCE(${data.label ?? null}, label),
      session_date = ${data.sessionDate === undefined ? sql`session_date` : data.sessionDate},
      sort_order = COALESCE(${data.sortOrder ?? null}, sort_order)
    WHERE id = ${id}
    RETURNING *`;
  return (rows[0] as CohortSession) ?? null;
}

export async function deleteCohortSession(id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM cohort_sessions WHERE id = ${id}`;
}

/**
 * Add a member to a cohort: reuse the client (dedupe by email) or create one,
 * then create a program_type='cohort' enrollment linked to the cohort.
 */
export async function addCohortMember(data: {
  cohortId: string;
  name: string;
  email: string;
  goal: string;
}): Promise<{ client: Client; enrollment: Enrollment; reusedClient: boolean }> {
  const sql = getSql();
  const existing = await findClientByEmail(data.email);

  let client: Client;
  let reusedClient: boolean;
  if (existing) {
    client = existing;
    reusedClient = true;
  } else {
    const rows = await sql`
      INSERT INTO clients (name, email) VALUES (${data.name}, ${data.email}) RETURNING *`;
    client = rows[0] as Client;
    reusedClient = false;
  }

  const enrollRows = await sql`
    INSERT INTO enrollments (client_id, program_type, cohort_id, goal, total_sessions)
    VALUES (${client.id}, 'cohort', ${data.cohortId}, ${data.goal}, 0)
    RETURNING *`;
  return { client, enrollment: enrollRows[0] as Enrollment, reusedClient };
}

export async function getCohortContent(cohortId: string): Promise<ContentItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM content_items WHERE cohort_id = ${cohortId} ORDER BY created_at DESC`;
  return rows as ContentItem[];
}

/** Create a shared cohort content row from a pasted R2 link (zero-vector; never searched). */
export async function insertCohortContent(data: {
  title: string;
  cohortId: string;
  mediaType: 'audio' | 'video' | 'pdf';
  r2Key: string;
  publicUrl: string;
}): Promise<string> {
  const sql = getSql();
  const zeroVec = `[${new Array(1024).fill(0).join(',')}]`;
  const rows = await sql`
    INSERT INTO content_items
      (title, description, media_type, use_cases, mood_tags,
       r2_key, public_url, embedding, cohort_id, downloadable)
    VALUES
      (${data.title}, '', ${data.mediaType}, '', '',
       ${data.r2Key}, ${data.publicUrl}, ${zeroVec}::vector, ${data.cohortId}, true)
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
