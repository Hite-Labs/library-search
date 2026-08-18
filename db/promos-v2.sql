-- Promos v2 — run this once against Neon before deploying.
--
-- Paste into the Neon SQL Editor (neon.tech -> your project -> SQL Editor) and Run.
--
-- SAFE TO RUN: the promos table currently holds ZERO rows (verified 2026-08-18). The v1
-- table was created for the first cut of this feature and never held a production promo,
-- so nothing is lost by recreating it. No other table is touched.

DROP INDEX IF EXISTS promos_active_idx;
DROP TABLE IF EXISTS promos;

CREATE TABLE promos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  hide_if_has   text,
  note          text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX promos_active_idx ON promos (active) WHERE active;

-- Check it worked — expect 8 rows, ending in created_at:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'promos';
