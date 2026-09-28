import { randomUUID } from 'crypto';
import { getSql } from '../db';

/**
 * Postgres access for the intake automation: the events GHL sends and the setup steps each
 * one fans out into (CC-1, CC-2). Kept out of lib/db.ts, which is already the whole rest of
 * the app, but written in the same style.
 */

export const STEP_ORDER = ['client', 'drive', 'telegram', 'routine', 'notify_ready'] as const;
export type StepName = (typeof STEP_ORDER)[number];

/** What Lindsay sees for each step on the /attention checklist. */
export const STEP_LABELS: Record<StepName, string> = {
  client: 'Member',
  drive: 'Drive folder',
  telegram: 'Telegram',
  routine: 'Drafts',
  notify_ready: 'Notified',
};

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';
export type EventStatus = 'received' | 'processing' | 'complete' | 'failed' | 'invalid';

export interface IntakeEvent {
  id: string;
  type: 'new_coaching_client';
  ghl_contact_id: string | null;
  email: string | null;
  first_name: string;
  last_name: string;
  payload: Record<string, unknown>;
  status: EventStatus;
  error: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntakeStep {
  id: string;
  event_id: string;
  step: StepName;
  seq: number;
  status: StepStatus;
  attempts: number;
  last_error: string | null;
  result: Record<string, unknown>;
  next_run_at: string;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

/** Record a payload we refused (e.g. no email), so it shows on /attention rather than vanishing. */
export async function insertInvalidEvent(data: {
  ghlContactId: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  payload: unknown;
  error: string;
}): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO intake_events (type, ghl_contact_id, email, first_name, last_name, payload, status, error)
    VALUES ('new_coaching_client', ${data.ghlContactId}, ${data.email}, ${data.firstName},
            ${data.lastName}, ${JSON.stringify(data.payload ?? {})}::jsonb, 'invalid', ${data.error})
    RETURNING id`;
  return rows[0].id as string;
}

/**
 * Store a valid intake and its setup steps, atomically. Returns the new event id, or null
 * when this contact already has an intake of this type (the dedupe: GHL retries, and exposes
 * no submission id to key on).
 *
 * The id is minted here rather than RETURNING'd so the step rows can go in the same
 * transaction — Neon's HTTP driver batches statements but can't feed one's output into the
 * next. The step insert is conditioned on the event row being ours, so a conflicting
 * duplicate adds no steps either.
 */
export async function insertEventWithSteps(data: {
  ghlContactId: string;
  email: string;
  firstName: string;
  lastName: string;
  payload: unknown;
}): Promise<string | null> {
  const sql = getSql();
  const id = randomUUID();
  const steps = STEP_ORDER.map((s) => s as string);
  const seqs = STEP_ORDER.map((_, i) => i + 1);

  const [inserted] = await sql.transaction([
    sql`
      INSERT INTO intake_events (id, type, ghl_contact_id, email, first_name, last_name, payload, status)
      VALUES (${id}, 'new_coaching_client', ${data.ghlContactId}, ${data.email},
              ${data.firstName}, ${data.lastName}, ${JSON.stringify(data.payload ?? {})}::jsonb, 'received')
      ON CONFLICT (type, ghl_contact_id) WHERE status <> 'invalid' DO NOTHING
      RETURNING id`,
    sql`
      INSERT INTO intake_steps (event_id, step, seq)
      SELECT ${id}::uuid, s.step, s.seq
      FROM unnest(${steps}::text[], ${seqs}::int[]) AS s(step, seq)
      WHERE EXISTS (SELECT 1 FROM intake_events WHERE id = ${id}::uuid)`,
  ]);
  return (inserted as { id: string }[])[0]?.id ?? null;
}

/**
 * Claim the next step that is due, in one atomic statement, so two runners (the after()
 * kick and the cron tick) can never both take the same row.
 *
 * Due means: pending and past its backoff, or `running` with an expired lock — the process
 * running it died (pm2 restart, deploy), and the handler's idempotency makes re-running safe.
 * A step only becomes due once every earlier step of its event is done, which is what makes
 * them run in order.
 */
export async function claimNextStep(): Promise<IntakeStep | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE intake_steps s
    SET status = 'running',
        attempts = s.attempts + 1,
        locked_until = now() + interval '5 minutes',
        updated_at = now()
    WHERE s.id = (
      SELECT c.id FROM intake_steps c
      WHERE ((c.status = 'pending' AND c.next_run_at <= now())
          OR (c.status = 'running' AND c.locked_until < now()))
        AND NOT EXISTS (
          SELECT 1 FROM intake_steps p
          WHERE p.event_id = c.event_id AND p.seq < c.seq AND p.status <> 'done'
        )
      ORDER BY c.created_at, c.seq
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING s.*`;
  return (rows[0] as IntakeStep) ?? null;
}

export async function getEvent(id: string): Promise<IntakeEvent | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM intake_events WHERE id = ${id}`;
  return (rows[0] as IntakeEvent) ?? null;
}

export async function getStep(id: string): Promise<IntakeStep | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM intake_steps WHERE id = ${id}`;
  return (rows[0] as IntakeStep) ?? null;
}

export async function getStepsForEvent(eventId: string): Promise<IntakeStep[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM intake_steps WHERE event_id = ${eventId} ORDER BY seq`;
  return rows as IntakeStep[];
}

/** Merge fields into a step's stored result mid-run — the checkpoint that makes a re-run skip work already done. */
export async function mergeStepResult(stepId: string, partial: Record<string, unknown>): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE intake_steps
    SET result = result || ${JSON.stringify(partial)}::jsonb, updated_at = now()
    WHERE id = ${stepId}`;
}

export async function completeStep(stepId: string, result: Record<string, unknown>): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE intake_steps
    SET status = 'done', result = result || ${JSON.stringify(result)}::jsonb,
        last_error = NULL, locked_until = NULL, updated_at = now()
    WHERE id = ${stepId}`;
}

/** Put a step back in the queue after a transient failure. */
export async function scheduleRetry(stepId: string, error: string, runAt: Date): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE intake_steps
    SET status = 'pending', last_error = ${error}, next_run_at = ${runAt.toISOString()},
        locked_until = NULL, updated_at = now()
    WHERE id = ${stepId}`;
}

export async function parkStep(stepId: string, status: 'failed' | 'blocked', error: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE intake_steps
    SET status = ${status}, last_error = ${error}, locked_until = NULL, updated_at = now()
    WHERE id = ${stepId}`;
}

/**
 * Manual retry from /attention (CC-9): back to pending, due now, attempt count reset.
 * `clearKeys` drops result fields that would otherwise stop the handler — the routine step's
 * "a fire may be in flight" marker is the one that needs this.
 */
export async function resetStep(stepId: string, clearKeys: string[] = []): Promise<IntakeStep | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE intake_steps
    SET status = 'pending', attempts = 0, next_run_at = now(), locked_until = NULL,
        result = result - ${clearKeys}::text[], updated_at = now()
    WHERE id = ${stepId} AND status IN ('failed', 'blocked')
    RETURNING *`;
  return (rows[0] as IntakeStep) ?? null;
}

/** The live (non-invalid) intake a contact already has — the row a duplicate collided with. */
export async function findEventForContact(ghlContactId: string): Promise<IntakeEvent | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM intake_events
    WHERE type = 'new_coaching_client' AND ghl_contact_id = ${ghlContactId} AND status <> 'invalid'
    LIMIT 1`;
  return (rows[0] as IntakeEvent) ?? null;
}

/** Roll the event's status up from its steps. */
export async function refreshEventStatus(eventId: string): Promise<EventStatus> {
  const sql = getSql();
  const rows = await sql`
    UPDATE intake_events e
    SET status = CASE
          WHEN NOT EXISTS (SELECT 1 FROM intake_steps s WHERE s.event_id = e.id AND s.status <> 'done') THEN 'complete'
          WHEN EXISTS (SELECT 1 FROM intake_steps s WHERE s.event_id = e.id AND s.status IN ('failed', 'blocked')) THEN 'failed'
          ELSE 'processing'
        END,
        updated_at = now()
    WHERE e.id = ${eventId} AND e.status <> 'invalid'
    RETURNING e.status`;
  return (rows[0]?.status as EventStatus) ?? 'invalid';
}

/**
 * Whether another intake for the same client already fired (or may be firing) the drafting
 * routine. Dedupe is per GHL contact, so a person with two GHL contacts produces two events
 * for one client — and must still get one intro email.
 */
export async function routineAlreadyFiredForClient(clientId: string, exceptEventId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM intake_steps s JOIN intake_events e ON e.id = s.event_id
    WHERE e.client_id = ${clientId} AND e.id <> ${exceptEventId} AND s.step = 'routine'
      AND ((s.result ->> 'firedAt') IS NOT NULL OR (s.result ->> 'fireStartedAt') IS NOT NULL)
    LIMIT 1`;
  return rows.length > 0;
}

export async function setEventClient(eventId: string, clientId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE intake_events SET client_id = ${clientId}, updated_at = now() WHERE id = ${eventId}`;
}

// ── /attention (CC-9) ────────────────────────────────────────────────────────

export interface AttentionEvent extends IntakeEvent {
  client_name: string | null;
  drive_folder_id: string | null;
  notes_doc_id: string | null;
  telegram_invite_link: string | null;
  steps: IntakeStep[];
}

/** Recent intakes, newest first, each with its steps and the links the checklist needs. */
export async function listAttentionEvents(limit = 50): Promise<AttentionEvent[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT e.*,
           c.name AS client_name, c.drive_folder_id, c.notes_doc_id,
           t.invite_link AS telegram_invite_link,
           COALESCE(
             (SELECT json_agg(s ORDER BY s.seq) FROM intake_steps s WHERE s.event_id = e.id),
             '[]'::json
           ) AS steps
    FROM intake_events e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN telegram_spaces t ON t.client_id = e.client_id
    ORDER BY e.created_at DESC
    LIMIT ${limit}`;
  return rows as AttentionEvent[];
}
