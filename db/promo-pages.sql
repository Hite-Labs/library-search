-- Promo page targeting — run this once against Neon before deploying.
--
-- Paste into the Neon SQL Editor (neon.tech -> your project -> SQL Editor) and Run.
--
-- SAFE TO RUN: one additive column, then a backfill of the rows that already exist. No
-- existing column is altered and no other table is touched. Re-running it is an error
-- rather than a risk (Postgres will say the column already exists).
--
-- WHY THE BACKFILL: an empty page list means the promo shows NOWHERE, so adding the column
-- with its bare default would silently switch off every promo already running. The rows
-- live at the time of writing were 'audio-membership' and 'ind-coaching', both active. They
-- are opened to all four pages, which reproduces exactly the behaviour they had before this
-- column existed — placement was a pure Webflow decision then, so "wherever the block is"
-- and "every page" are the same thing.
--
-- Then narrow them in the dashboard: untick the pages an offer shouldn't appear on. That is
-- a safe direction to move (an offer disappears from a page), whereas starting blank would
-- have meant a live outage of both offers until someone noticed.

ALTER TABLE promos ADD COLUMN pages text[] NOT NULL DEFAULT '{}';

-- Only rows that predate the column. A promo created after this migration goes through the
-- dashboard, which makes the page choice explicit.
UPDATE promos
   SET pages = ARRAY['membership','coaching','cohort','challenge']
 WHERE pages = '{}';
