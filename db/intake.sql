-- Coaching intake automation (CC-1 … CC-14).
--
--   node scripts/run-migration.mjs db/intake.sql          # dry run
--   node scripts/run-migration.mjs db/intake.sql --apply  # run it (Neon is PRODUCTION)
--
-- Additive only: four new tables, two nullable columns on clients, one index. Nothing
-- existing is rewritten, so applying it under the CURRENT app is harmless.
--
-- Apply it BEFORE deploying the code that uses it. The portal and client page tolerate the
-- tables being absent, but intake, /attention and custom audio simply don't work without them.

BEGIN;

-- One person, one row, whatever case their email arrived in. findClientByEmail already
-- matches on lower(email); this makes the database refuse a case-variant duplicate too.
-- Checked before writing: no existing rows collide.
CREATE UNIQUE INDEX clients_email_lower_idx ON clients (lower(email));

-- Where a client's Drive folder and notes doc live (CC-4). Set once, never recreated.
ALTER TABLE clients ADD COLUMN drive_folder_id text;
ALTER TABLE clients ADD COLUMN notes_doc_id text;

-- Every intake webhook GHL sends, as received (CC-1).
CREATE TABLE intake_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL CHECK (type IN ('new_coaching_client')),
  ghl_contact_id  text,
  email           text,
  first_name      text NOT NULL DEFAULT '',
  last_name       text NOT NULL DEFAULT '',
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received', 'processing', 'complete', 'failed', 'invalid')),
  -- Why an `invalid` event was refused, shown on /attention.
  error           text,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The dedupe key. GHL exposes no submission id and retries slow responses, so one contact
-- gets one intake per type. Invalid events are excluded so a fixed re-submission still lands.
CREATE UNIQUE INDEX intake_events_contact_idx
  ON intake_events (type, ghl_contact_id) WHERE status <> 'invalid';
CREATE INDEX intake_events_created_idx ON intake_events (created_at DESC);

-- One row per setup step per event (CC-2). The runner claims a pending row, runs it, and
-- stores what it made in `result`, which is what makes a re-run a no-op.
CREATE TABLE intake_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES intake_events(id) ON DELETE CASCADE,
  step          text NOT NULL,
  seq           integer NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'done', 'failed', 'blocked')),
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  result        jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_run_at   timestamptz NOT NULL DEFAULT now(),
  -- A `running` row whose lock has expired was cut off (pm2 restart) and is reclaimed.
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, step)
);
CREATE INDEX intake_steps_due_idx ON intake_steps (status, next_run_at);

-- Pre-made private Telegram groups, handed out one per client (CC-5).
CREATE TABLE telegram_spaces (
  chat_id      bigint PRIMARY KEY,
  status       text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned')),
  client_id    uuid UNIQUE REFERENCES clients(id) ON DELETE SET NULL,
  invite_link  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  assigned_at  timestamptz
);

-- Custom audios Lindsay records for one buyer and delivers to their portal (CC-13).
CREATE TABLE custom_audios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  r2_key        text,
  media_type    text NOT NULL DEFAULT 'audio' CHECK (media_type IN ('audio', 'video')),
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'delivered')),
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custom_audios_client_idx ON custom_audios (client_id, delivered_at DESC);

COMMIT;
