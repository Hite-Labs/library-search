-- Getting Started + search visibility — run this once against Neon before deploying.
--
-- Paste into the Neon SQL Editor (neon.tech -> your project -> SQL Editor) and Run.
--
-- SAFE TO RUN: three additive columns on content_items, two indexes and one constraint.
-- No existing column is altered, no data is rewritten, and every default reproduces
-- today's behaviour exactly — every item stays visible in search and nothing is marked
-- Getting Started until Lindsay marks it. Re-running is an error rather than a risk
-- (Postgres will say the column already exists).
--
-- RUN IT ALL AT ONCE. The whole file is wrapped in BEGIN/COMMIT because the statements
-- depend on each other: the function at the bottom references hidden_from_search, which
-- the ALTER near the top adds. Running it statement-by-statement and stopping partway
-- would leave the schema half-migrated — most visibly, a replaced search function
-- referencing a column that doesn't exist yet, which breaks member search. With the
-- transaction, any error rolls the whole thing back and nothing changes.

BEGIN;

-- ── Getting Started ──────────────────────────────────────────────────────────
--
-- A curated on-ramp for new members: one Primary item and any number of Secondary
-- ones, all of them content that is ALREADY in the library. This is deliberately a
-- flag on content_items rather than a new table or content type — the whole point of
-- the feature is that Lindsay uploads nothing new, she just points at what exists.
--
-- NULL means "not part of Getting Started", which is every row today.
ALTER TABLE content_items ADD COLUMN getting_started text
  CHECK (getting_started IN ('primary', 'secondary'));

-- Only ONE item can be Primary, enforced here rather than left to the dashboard.
--
-- A partial unique index rather than a CHECK: the rule is about the table as a whole
-- ("at most one row anywhere"), which a row-level CHECK cannot express. The WHERE
-- clause is what makes it partial — unlimited rows may be 'secondary' or NULL, and at
-- most one may be 'primary'.
--
-- The alternative was a UI convention, and the reason this is in the database instead
-- is that /api/portal has to answer "which item is Primary?" with exactly one answer.
-- If two rows could claim it, the portal would be picking a winner by created_at and
-- Lindsay would have no way to see which one the member actually got. Promoting a new
-- Primary demotes the old one in the same transaction (see setGettingStarted in
-- lib/db.ts), so she never has to clear the previous one by hand.
CREATE UNIQUE INDEX content_items_one_primary_idx
  ON content_items (getting_started)
  WHERE getting_started = 'primary';

-- Display order for the Secondary list. Lindsay reorders them in the dashboard; the
-- portal returns them in this order, then by created_at for ties.
ALTER TABLE content_items ADD COLUMN getting_started_order integer NOT NULL DEFAULT 0;

-- Getting Started is shown to every new member, so a private client recording or a
-- cohort file must never be flagged into it — that would publish one person's session
-- to everyone. The dashboard only offers public-library rows to pick from, but this is
-- the constraint that makes the leak impossible rather than merely unlikely.
--
-- Written as "if flagged, then both must be NULL" so it permits every existing row
-- (all of which have getting_started NULL) without a backfill.
ALTER TABLE content_items ADD CONSTRAINT content_items_getting_started_public_only
  CHECK (
    getting_started IS NULL
    OR (client_id IS NULL AND cohort_id IS NULL)
  );

-- The portal's query: the flagged items, in display order.
CREATE INDEX content_items_getting_started_idx
  ON content_items (getting_started, getting_started_order)
  WHERE getting_started IS NOT NULL;

-- ── Search visibility ────────────────────────────────────────────────────────
--
-- Lets an item exist in the library without appearing in search results. The case
-- that prompted it: a "how to use this tool" video that belongs in Getting Started
-- but shouldn't clutter search, and won't stay relevant once a different Primary
-- item replaces it.
--
-- INDEPENDENT of getting_started, deliberately. Either flag can be set without the
-- other: a hidden item need not be Getting Started, and a Getting Started item need
-- not be hidden. The dashboard pre-ticks this when Lindsay marks something Primary,
-- because that is the common case — but it is a default she can untick, not a rule,
-- so the two columns never have to be reasoned about together.
--
-- DEFAULT false = visible, which is what every existing row already is.
ALTER TABLE content_items ADD COLUMN hidden_from_search boolean NOT NULL DEFAULT false;

-- ── Search now respects hidden_from_search ───────────────────────────────────
--
-- One added clause. match_content_items is the ONLY path member search takes, so
-- filtering here covers every caller — there is no second query to keep in step.
--
-- Note this sits alongside the existing client_id/cohort_id guard rather than
-- replacing it: those exclude content that is private to someone, this excludes
-- content that is public but deliberately unlisted. Different reasons, same effect
-- on the result set.
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
    AND NOT ci.hidden_from_search                      -- exclude deliberately unlisted items
    AND 1 - (ci.embedding <=> query_embedding) > match_threshold
  ORDER BY ci.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

COMMIT;
