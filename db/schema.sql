CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE content_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webflow_item_id  text UNIQUE,
  title            text NOT NULL,
  description      text NOT NULL,
  media_type       text NOT NULL CHECK (media_type IN ('audio','video','pdf')),
  use_cases        text NOT NULL DEFAULT '',
  modality         text,
  mood_tags        text NOT NULL DEFAULT '',
  duration_seconds integer,
  r2_key           text NOT NULL,
  public_url       text NOT NULL,
  content_page_url text,
  transcript       text,
  embedding        vector(1024) NOT NULL,
  program_id       uuid,
  sequence_order   integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_items_embedding_idx
  ON content_items USING hnsw (embedding vector_cosine_ops);

CREATE INDEX content_items_media_type_idx ON content_items (media_type);
CREATE INDEX content_items_program_id_idx ON content_items (program_id);

-- ── Client management (coaching) ─────────────────────────────────────────────

CREATE TABLE clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,          -- identity / dedupe key
  memberstack_id text UNIQUE,                    -- nullable; set when provisioned later
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The repeatable "pack": one row per program signup. Holds all progress state,
-- so a client can do multiple individual packs over time (and cohorts later).
CREATE TABLE enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  program_type    text NOT NULL DEFAULT 'individual'
                    CHECK (program_type IN ('individual','cohort')),
  goal            text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','complete')),
  total_sessions  integer NOT NULL DEFAULT 6,
  sessions_done   integer NOT NULL DEFAULT 0,    -- may exceed total (makeup/bonus)
  next_session_at timestamptz,
  calendar_url    text NOT NULL DEFAULT '',       -- per-client scheduling/booking link
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enrollments_client_id_idx ON enrollments (client_id);
CREATE INDEX enrollments_status_idx ON enrollments (status);

CREATE TABLE session_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  session_date  timestamptz NOT NULL DEFAULT now(),
  notes         text NOT NULL DEFAULT '',
  next_actions  text NOT NULL DEFAULT '',          -- client actions (tasks the client owns)
  coach_actions text NOT NULL DEFAULT '',          -- coach actions (tasks Lindsay owns)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_logs_enrollment_id_idx ON session_logs (enrollment_id);

-- Client recordings reuse content_items: a recording tagged to a client_id with
-- downloadable=true is private to that client (excluded from library search below).
ALTER TABLE content_items ADD COLUMN client_id uuid REFERENCES clients(id);
ALTER TABLE content_items ADD COLUMN downloadable boolean NOT NULL DEFAULT false;
ALTER TABLE content_items ADD COLUMN session_label text;
CREATE INDEX content_items_client_id_idx ON content_items (client_id);

-- Distinguishes a client's session Zoom recordings from standalone delivered files
-- (EFT/hypnotherapy audio, PDFs) for the portal's two response arrays (DS-08).
ALTER TABLE content_items ADD COLUMN kind text NOT NULL DEFAULT 'recording'
  CHECK (kind IN ('recording','file'));

-- ── Cohorts (group programs) ─────────────────────────────────────────────────

CREATE TABLE cohorts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  goal            text NOT NULL DEFAULT '',        -- shared theme/goal
  total_sessions  integer NOT NULL DEFAULT 4,
  current_session integer NOT NULL DEFAULT 0,      -- group progress, advanced manually
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','complete','archived')),
  zoom_url        text NOT NULL DEFAULT '',         -- shared weekly Zoom link
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cohort_sessions (                      -- the fixed dated schedule
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id    uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  session_date timestamptz,
  title        text NOT NULL DEFAULT '',            -- free-text session name (e.g. "Morning Alignment")
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cohort_sessions_cohort_id_idx ON cohort_sessions (cohort_id);

-- Cohort members reuse enrollments (program_type='cohort'), linked via cohort_id.
ALTER TABLE enrollments ADD COLUMN cohort_id uuid REFERENCES cohorts(id);
CREATE INDEX enrollments_cohort_id_idx ON enrollments (cohort_id);

-- Shared cohort content: tagged with cohort_id (client_id stays null). Private to
-- the cohort, excluded from library search (see match_content_items below).
ALTER TABLE content_items ADD COLUMN cohort_id uuid REFERENCES cohorts(id);
CREATE INDEX content_items_cohort_id_idx ON content_items (cohort_id);

-- Cohort-level async chat link (Telegram), surfaced prominently in the portal cohort tab.
ALTER TABLE cohorts ADD COLUMN telegram_url text NOT NULL DEFAULT '';
-- Scheduler inputs: auto-plot cohort_sessions on creation, still editable per-row after.
ALTER TABLE cohorts ADD COLUMN start_date timestamptz;
ALTER TABLE cohorts ADD COLUMN session_cadence text NOT NULL DEFAULT 'weekly'
  CHECK (session_cadence IN ('weekly','biweekly'));

-- Per-session discussion prompt shown in the portal for that session.
ALTER TABLE cohort_sessions ADD COLUMN prompt_text text NOT NULL DEFAULT '';

-- Files tied to a specific cohort session (e.g. that week's recording); nullable so
-- cohort-wide files (cohort_session_id NULL) keep working as today.
ALTER TABLE content_items ADD COLUMN cohort_session_id uuid REFERENCES cohort_sessions(id);
CREATE INDEX content_items_cohort_session_id_idx ON content_items (cohort_session_id);

-- Cohort end date: when the whole program finishes. Drives the portal's "cohort ended →
-- unlock every session" rule, which otherwise never fires. Nullable — an open-ended cohort
-- simply locks per-session-date as before.
ALTER TABLE cohorts ADD COLUMN end_date timestamptz;

-- Per-member cohort files. No new column needed: content_items already carries both
-- cohort_id and client_id, so the three cohort content shapes are distinguished by which
-- are set —
--   cohort_id + cohort_session_id  → that session's shared files
--   cohort_id, client_id NULL      → cohort-wide files (everyone sees them)
--   cohort_id + client_id          → private to that member within the cohort
-- This index serves the last case (the portal's `my_files` query).
CREATE INDEX content_items_cohort_client_idx ON content_items (cohort_id, client_id)
  WHERE cohort_id IS NOT NULL AND client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION match_content_items(
  query_embedding vector(1024),
  match_threshold float,
  match_count     int
)
RETURNS TABLE (
  id               uuid,
  webflow_item_id  text,
  title            text,
  description      text,
  media_type       text,
  use_cases        text,
  modality         text,
  mood_tags        text,
  duration_seconds integer,
  public_url       text,
  content_page_url text,
  similarity       float
)
LANGUAGE sql STABLE AS $$
  SELECT
    ci.id,
    ci.webflow_item_id,
    ci.title,
    ci.description,
    ci.media_type,
    ci.use_cases,
    ci.modality,
    ci.mood_tags,
    ci.duration_seconds,
    ci.public_url,
    ci.content_page_url,
    1 - (ci.embedding <=> query_embedding) AS similarity
  FROM content_items ci
  WHERE ci.client_id IS NULL AND ci.cohort_id IS NULL  -- exclude private client + cohort content
    AND 1 - (ci.embedding <=> query_embedding) > match_threshold
  ORDER BY ci.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

-- ── Promo blocks ─────────────────────────────────────────────────────────────
-- Upsell pieces shown in the portal. A member with no plan is the primary funnel, not an
-- error state, so promos are visible any time rather than gated to a moment — and every
-- page can carry one.
--
-- Visibility is "show only if the member does NOT already hold this plan", expressed as
-- requires_missing_plan. That single rule covers the whole matrix Lindsay described:
-- individual members see cohort/membership offers, cohort members see individual, and so on.
-- NULL means "show to everyone" (a general announcement, no plan involved).
--
-- kind distinguishes a buy CTA from an inclusion notice: a member whose plan already covers
-- the thing should read "included with your membership — take a look", not be sold it again.
-- Same block system, different Webflow template.
--
-- Retiring an offer is `active = false`, or letting ends_at pass. No deploy.
CREATE TABLE promos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  cta_label     text NOT NULL DEFAULT '',
  cta_url       text NOT NULL DEFAULT '',
  -- The plan key (lib/memberstack.ts PLAN_KEYS) a member must NOT hold for this to show.
  -- Deliberately un-constrained text: the plan registry lives in TS, and a CHECK here would
  -- have to be migrated in lockstep every time a plan is added. An unknown key simply never
  -- matches a held plan, so it shows to everyone — the safe direction for an upsell.
  requires_missing_plan text,
  kind          text NOT NULL DEFAULT 'buy' CHECK (kind IN ('buy','inclusion')),
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- The portal's only query: active promos in display order.
CREATE INDEX promos_active_idx ON promos (active, sort_order) WHERE active;

-- ── Promos v2: codes and access rules, not content ───────────────────────────
--
-- The first cut (above) stored the promo's title, body and button here, and portal.js
-- cloned a Webflow template and filled them in. That put one job in two places: Lindsay
-- built the block in Webflow, then re-typed its words into the dashboard.
--
-- So the split flips. The promo IS the Webflow element — its image, copy, layout and
-- hardcoded button all live there and are never touched by the script. This table answers
-- one question about each: may this member see it?
--
-- The join is a code. Lindsay marks the element `data-promo="cohort-upsell"` and creates a
-- row with the same code. A block whose code has no row here stays HIDDEN: a typo then
-- costs an impression, which she notices, rather than advertising the cohort to someone who
-- already bought it, which nobody notices.
--
-- Recreated rather than migrated: the v1 table never held a production row.
DROP INDEX IF EXISTS promos_active_idx;
DROP TABLE IF EXISTS promos;

CREATE TABLE promos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches the data-promo attribute in Webflow. UNIQUE because two rows claiming one code
  -- would make a block's visibility depend on which row happened to be read first.
  code          text NOT NULL UNIQUE,
  -- The plan key (lib/plan-keys.ts PLAN_KEYS) a member must NOT hold for this to show.
  -- NULL means "show to everyone". Deliberately un-constrained text, as in v1: the plan
  -- registry lives in TS, and a CHECK here would need migrating in lockstep every time a
  -- plan is added. An unknown key never matches a held plan, so it shows to everyone — the
  -- safe direction for an upsell, and the dashboard flags it in amber.
  hide_if_has   text,
  -- Operator-facing only. Never sent to the portal, never rendered to a member: with no
  -- title in this table any more, a row needs something human to recognise it by.
  note          text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The portal's only query: which codes are live right now. sort_order is gone — display
-- order is the Webflow page's own DOM order, since the blocks are authored in place.
CREATE INDEX promos_active_idx ON promos (active) WHERE active;

-- ── 21-day challenge ─────────────────────────────────────────────────────────
--
-- Deliberately NOT a cohort variant, and much smaller than one, for two reasons.
--
-- 1. The content lives in Webflow. Lindsay builds all 21 days on the page; this table
--    never holds a video, a file or an R2 key. It answers exactly one question:
--    which day numbers may a member see right now? (Same philosophy as promos above.)
--
-- 2. There is no roster. Access is the Memberstack challenge plan, however it was
--    obtained — bought directly, bundled with the audio membership, or added to an
--    existing coaching client. A member holding the plan is in; that is the whole rule.
--    So there is no challenge_members table, no client_id, and no per-member state.
--
-- One shared clock: day N unlocks at start_date + (N-1) days, at reveal_time. Someone who
-- buys mid-run sees every day up to today at once and continues with everyone else, which
-- is what lets a single daily email serve the whole run.
--
-- Day numbers are computed, never stored — a challenge_days table would hold nothing but
-- arithmetic. If per-day titles or prompts are ever wanted in the DB rather than Webflow,
-- that is an additive table later.
CREATE TABLE challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  -- When day 1 unlocks. Nullable so a run can be drafted before its dates are settled;
  -- a challenge with no start_date reveals nothing.
  start_date    timestamptz,
  total_days    integer NOT NULL DEFAULT 21,
  -- Local time of day each new day appears, "HH:MM" in reveal_timezone. Stored as text
  -- rather than `time` so it round-trips through JSON unchanged.
  reveal_time   text NOT NULL DEFAULT '06:00',
  -- IANA zone the reveal happens in. One zone for the whole run, deliberately: the
  -- alternative is per-member local time, which would mean day 4 appearing at different
  -- absolute moments for different people and no single instant for the daily email.
  reveal_timezone text NOT NULL DEFAULT 'America/New_York',
  -- How long the run stays open, counted from day 1 — NOT extra days on the end. "21 days
  -- of content, open for 45" is total_days=21, open_for_days=45, giving 24 days to catch
  -- up. Clamped to at least total_days at read time so a mis-set value can never close a
  -- run before its own content has finished dropping.
  open_for_days integer NOT NULL DEFAULT 45,
  -- How many days after the start someone can still join and get THIS run. 0 = no cutoff.
  --
  -- The community half of the challenge is why this exists: arriving with five days left
  -- means missing the group entirely. Someone who buys after the cutoff keeps their account
  -- and their plan — nothing is revoked, ever — they just wait for the next run.
  --
  -- A count of days rather than a date, like everything else here, so the whole schedule
  -- moves with the run and a three-month challenge is the same fields with other numbers.
  join_cutoff_days integer NOT NULL DEFAULT 10,
  telegram_url  text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','complete','archived')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The portal's only query: the one runnable challenge. Partial index because every
-- lookup filters to active.
CREATE INDEX challenges_active_idx ON challenges (start_date) WHERE status = 'active';
