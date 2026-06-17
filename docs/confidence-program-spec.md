# Confidence Program — Spec & Phase 1 Plan

> Status: **Spec saved. Not yet started.** Prerequisite: finish testing the existing
> content uploader end-to-end first, so client management is added onto a tested base.

This document has two parts:
1. **User Stories** — the requirements (source of truth).
2. **Phase 1 Plan** — operator dashboard + data model + client-facing APIs (manual-first).

---

# Part 1 — User Stories

## Client

**C-01** — As a new client, after I sign my contract and pay, I want to be directed to create my account so I can access my program immediately.
- *Acceptance:* GHL payment triggers Memberstack invite email. Client lands on signup and is redirected to their portal page on first login.
- *Notes:* Intake form goal should already be in their record before they arrive.

**C-02** — As a client, when I log into my portal I want to see my personal goal at the top so I feel seen and know I'm in the right place.
- *Acceptance:* Portal page displays goal pulled from their client record. Lindsay sets this from the operator dashboard.
- *Notes:* Goal comes from intake form, confirmed or refined by Lindsay after session 1.

**C-03** — As a client, I want to see my custom recordings pinned at the top of my library page so I can find them without searching.
- *Acceptance:* Client recordings appear in a distinct "Your Program" section above the AI search. Each shows session label and download button.
- *Notes:* Only recordings tagged to their client_id with downloadable: true appear here.

**C-04** — As a client, I want to download my custom recordings so I can keep them after my program ends.
- *Acceptance:* Download button generates a signed Cloudflare R2 URL. File downloads directly. Works regardless of membership status.
- *Notes:* Signed URLs should be time-limited but regenerated on each request.

**C-05** — As a client, I want to search the media library by how I'm feeling so the right content finds me.
- *Acceptance:* AI search input appears below "Your Program" section. Results visually distinct from pinned recordings. Powered by pgvector similarity search.
- *Notes:* Search results should never surface other clients' private recordings.

**C-06** — As a client, I want to see my upcoming session date on my portal so I always know what's next.
- *Acceptance:* Next session date displays on portal. Lindsay updates from dashboard or it pulls from Calendly.
- *Notes:* Manually updated field is fine for v1.

**C-07** — As a cohort member, I want access to cohort-specific content so I can find group resources easily.
- *Acceptance:* Cohort Memberstack plan tag unlocks a cohort page. 6-session tag unlocks personal portal. Both can be active simultaneously.

## Lindsay (Operator)

**L-01** — As Lindsay, I want to see today's sessions in order when I open the dashboard so I can prepare without hunting.
- *Acceptance:* Dashboard home shows today's Calendly sessions sorted by time. Each card shows client name, session number, and goal.
- *Notes:* Pulls from Calendly API. Falls back gracefully if no sessions today.

**L-02** — As Lindsay, I want to click into a client before a session and immediately see their plan, history, and last session notes.
- *Acceptance:* Client detail page shows: goal, session plan, all previous session logs with dates and notes, recordings delivered.
- *Notes:* Core pre-session prep view. Should load fast.

**L-03** — As Lindsay, I want to log a session note right after a call so I don't lose what happened.
- *Acceptance:* Session log entry form on client page. Fields: date (auto), notes (free text), anything assigned for next session. Saves to Neon.
- *Notes:* Lightweight quick capture — not a clinical form.

**L-04** — As Lindsay, I want to attach a custom recording to a client's record so it appears on their portal and they can download it.
- *Acceptance:* Recording upload or R2 link input on client page. Sets client_id, downloadable: true, adds to portal automatically.
- *Notes:* Lindsay may upload directly or paste an existing R2 link. Both should work.

**L-05** — As Lindsay, I want to update a client's goal so their portal always reflects where they actually are.
- *Acceptance:* Goal field is editable on client detail page. Saves to Neon, reflects immediately on client portal.

**L-06** — As Lindsay, I want to see each client's session progress at a glance so I always know where they are in the program.
- *Acceptance:* Session counter (e.g. 3 of 6) visible on client cards and on the client detail page.
- *Notes:* Counter increments when Lindsay logs a session.

**L-07** — As Lindsay, I want to see all active clients in one list so I can get a sense of where everyone is at.
- *Acceptance:* Clients list with name, session progress, status (Active / Paused / Complete), last session date. Filterable by status.

**L-08** — As Lindsay, I want to mark a client as complete when their 6 sessions are done so my active list stays clean.
- *Acceptance:* Status field on client record. Complete removes from active list but record remains accessible.

## System / Automation

**S-01** — When a client completes payment in GHL, the system should automatically create their client record and provision Memberstack access.
- *Acceptance:* GHL webhook → Node app → creates Neon client record (name, email, intake goal). Sends Memberstack invite. Session counter set to 0.
- *Notes:* Manual fallback: Lindsay can create a client record directly in the dashboard for v1.

**S-02** — When a custom recording is attached to a client record, it should appear on their portal without Lindsay doing anything else.
- *Acceptance:* Recording with client_id and downloadable: true surfaces automatically on client portal. No manual Webflow CMS update needed.

**S-03** — Client recordings should be served via signed URL so they are secure but fully downloadable.
- *Acceptance:* App generates time-limited Cloudflare R2 signed URL on each download request. Raw R2 URL never exposed. Works post-membership.

**S-04** — Library content should be streamable but not downloadable to protect Lindsay's IP.
- *Acceptance:* Library media served via streaming player only. No download option in UI. Differentiated from client recordings by downloadable flag.

---

# Part 2 — Phase 1 Plan (Operator Dashboard + Client Management)

## Scope & decisions (locked with the user)

This phase unifies the existing upload tool and the new client-management tool into **one
Next.js app with a shared login and nav** (`Upload` / `Clients`). Deployment target shifts
from Vercel to the **existing DigitalOcean droplet** (deferred — build/test feature first).

- **Client portal UI lives on Webflow** (Memberstack-gated). We build the **JSON APIs** it
  calls (goal, recordings, next session, search) — not the portal page itself.
- **Integrations are manual-first.** Build with manual client creation, manual goal, manual
  next-session date (the spec's own v1 fallbacks). Defer GHL webhook (S-01), Calendly
  (L-01/C-06 auto), and Memberstack provisioning to a later phase.
- **Operator auth stays the shared password** (existing `lib/auth.ts` + cookie). Only Lindsay
  uses the dashboard.

### Deferred to Phase 2 (out of scope here)
S-01 GHL webhook · Calendly sync · Memberstack auto-provisioning · the Webflow portal page
itself · streaming-player UI for S-04 (we enforce the `downloadable` distinction at the data/
API layer now; the player UI is a Webflow concern) · DigitalOcean deployment.

## Data model — `db/schema.sql`

Add two tables + extend recordings. Mirror existing style (uuid PKs, `gen_random_uuid()`,
`timestamptz` defaults, indexes).

```sql
CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  memberstack_id  text UNIQUE,                       -- nullable; set when provisioned
  goal            text NOT NULL DEFAULT '',          -- C-02, L-05
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','complete')),  -- L-07, L-08
  total_sessions  integer NOT NULL DEFAULT 6,        -- L-06 "x of 6"
  sessions_done   integer NOT NULL DEFAULT 0,        -- increments on session log (L-06)
  next_session_at timestamptz,                       -- manual for v1 (C-06)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_logs (              -- L-02 history, L-03 capture
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_date timestamptz NOT NULL DEFAULT now(),
  notes        text NOT NULL DEFAULT '',
  next_actions text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_logs_client_id_idx ON session_logs (client_id);

-- Client recordings reuse content_items (C-03/C-04/L-04/S-02/S-03):
ALTER TABLE content_items ADD COLUMN client_id uuid REFERENCES clients(id);
ALTER TABLE content_items ADD COLUMN downloadable boolean NOT NULL DEFAULT false;
ALTER TABLE content_items ADD COLUMN session_label text;          -- C-03
CREATE INDEX content_items_client_id_idx ON content_items (client_id);
```

**Privacy rule (C-05 note / S-04):** update `match_content_items` `WHERE` to add
`ci.client_id IS NULL` so private client recordings never appear in library search.
Library items = `client_id IS NULL`; client recordings = `client_id` set + `downloadable=true`.

## Backend (`lib/`)

- **`lib/db.ts`** — add helpers on the existing `getSql()` singleton: `listClients(status?)`
  (L-07), `getClient(id)`, `createClient(...)` (manual S-01), `updateClient(id, {...})`
  (L-05/L-08), `addSessionLog(...)` + increment `sessions_done` in a txn (L-03/L-06),
  `getSessionLogs(clientId)` (L-02), `getClientRecordings(clientId)` (C-03),
  `attachRecordingToClient(...)` (L-04/S-02). Add `Client` / `SessionLog` interfaces.
- **`lib/r2.ts`** — add `getPresignedGetUrl(r2Key, expiresIn=3600)` via `GetObjectCommand`
  (only PUT exists today). Powers C-04/S-03 downloads.
- **`lib/schemas.ts`** — zod schemas for create/update client, session log, attach recording,
  and portal request bodies (must carry `memberstackId` to scope queries).

## API routes (`app/api/`)

**Operator (cookie-guarded via `proxy.ts`):**
- `clients/route.ts` — GET list (L-07), POST create (manual S-01)
- `clients/[id]/route.ts` — GET detail w/ logs+recordings (L-02), PATCH goal/status/next (L-05/L-08)
- `clients/[id]/sessions/route.ts` — POST session log + increment counter (L-03/L-06)
- `clients/[id]/recordings/route.ts` — POST attach recording (L-04/S-02)
- `dashboard/today/route.ts` — today's sessions from `next_session_at` (L-01; Calendly later)

**Client-facing (public + CORS, scoped by `memberstackId`):**
- `portal/route.ts` — POST `{memberstackId}` → goal, next session, status, progress (C-02/C-06)
- `portal/recordings/route.ts` — POST `{memberstackId}` → that client's recordings (C-03)
- `portal/download/route.ts` — POST `{memberstackId, recordingId}` → fresh signed GET URL
  **after verifying ownership** (C-04/S-03; never expose raw URL)
- Library search (C-05) reuses existing `/api/search` (already CORS-enabled); the
  `match_content_items` privacy fix keeps client recordings out of results.

**Guarding:** extend `proxy.ts` matcher with `/api/clients/:path*`, `/api/dashboard/:path*`.
Do **not** guard `/api/portal/*` with the operator cookie. Add `/api/portal/*` CORS headers in
`next.config.ts` (mirror the existing `/api/search` block).

## Frontend — shared shell + Clients pages (`app/`)

- **Shared operator shell:** nav (`Upload` / `Clients`) shown after login via an
  `app/(dashboard)/layout.tsx` route group, reusing the lightweight-authed-fetch gate +
  `LoginForm` that `app/upload/page.tsx` already uses. Move upload under it. (Nav items, not
  a launchpad.)
- **`app/clients/page.tsx`** — clients list: name, progress "x of 6", status badge, last
  session date; filter by status (L-07).
- **`app/clients/[id]/page.tsx`** — detail (L-02): editable goal (L-05), progress counter
  (L-06), status control incl. "Mark complete" (L-08), session-log history (L-02), quick
  session-log form (L-03), attach-recording via existing upload flow OR paste R2 link (L-04),
  manual next-session date editor (C-06).
- Reuse existing upload UI (`upload-form.tsx`, FilePicker/TagInput) for recording-attach.
- Match existing Tailwind `stone-*` styling.

## Critical files
- `db/schema.sql` · `lib/db.ts` · `lib/r2.ts` · `lib/schemas.ts`
- `app/api/clients/**` · `app/api/dashboard/today` · `app/api/portal/**`
- `proxy.ts` (matcher) · `next.config.ts` (portal CORS)
- `app/(dashboard)/layout.tsx` (shell + nav) · `app/clients/**` · move `app/upload`

## Verification
1. `npm run build` stays green.
2. Run updated `db/schema.sql` in Neon (note: drops/recreates `match_content_items`); confirm
   `clients`, `session_logs`, new columns exist.
3. Operator flow (dev): log in → create client → set goal → log session (counter 0→1) →
   attach recording (R2-link path) → mark complete → leaves active filter.
4. Privacy: with a client recording present, `/api/search` must NOT return it.
5. Portal APIs (curl, no operator cookie): `/api/portal` + `/api/portal/recordings` with a
   known `memberstackId` return only that client's data; `/api/portal/download` returns a
   working time-limited URL and rejects a mismatched `memberstackId`.
6. Auth boundary: `/api/clients` without cookie → 401; `/api/portal/*` without cookie → 200.

## Notes
Memberstack identity on portal APIs is trust-the-id for v1; harden (verify Memberstack JWT)
when wiring the real Webflow portal in Phase 2.
