-- Library access for individual coaching clients — run this once against Neon before deploying.
--
-- Paste into the Neon SQL Editor (neon.tech -> your project -> SQL Editor) and Run.
--
-- SAFE TO RUN: one new table and two new nullable columns. Nothing existing is altered, and
-- nobody's access changes until the dashboard is used — every client starts with both
-- columns null, which reads as "never had coaching library access". Re-running it is safe
-- (IF NOT EXISTS / ON CONFLICT throughout).
--
-- See docs/scope-coaching-library-access.md for the rule these support.

-- Dashboard-editable settings. A key-value table rather than a column somewhere, because the
-- number of days is a business-wide setting with no row of its own to live on.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- How many days of library access a coaching client keeps after their last logged session.
INSERT INTO app_settings (key, value) VALUES ('coaching_library_days', '30')
ON CONFLICT (key) DO NOTHING;

-- When the daily expiry last ran. Stamped in updated_at; starts in the past so the first
-- cron tick after deploy runs it.
INSERT INTO app_settings (key, value, updated_at) VALUES ('library_expiry_last_run', 'null', 'epoch')
ON CONFLICT (key) DO NOTHING;

-- When we last gave this client the "membership included" plan. Null = never.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS library_access_granted_at timestamptz;
-- When the daily expiry took it away. Cleared when access is given back. Drives the
-- "lapsed" pitch on the library page.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS library_access_ended_at timestamptz;
