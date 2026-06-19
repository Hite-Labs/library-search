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
  label        text NOT NULL DEFAULT '',
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
