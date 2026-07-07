# SCOPED (not yet executed): Disentangle Clients (people) from Enrollments (programs)

> Status: **approved plan, deferred.** Saved 2026-07-07 for later execution. No code written yet.
> Build on a new branch `client-cohort-disentangle` off `main`; ship all stages in one pass.

## Context

The dashboard conflates **a person** with **a program they're enrolled in**. At the DB layer the
model is already correct — a person is ONE `clients` row (unique `email`, unique nullable
`memberstack_id`), and program participation lives in `enrollments` (one row per pack;
`program_type` ∈ individual|cohort; a cohort membership = an enrollment with `cohort_id` set;
there is no separate members table). But every **surface** is enrollment-grained, causing:

- **Duplicate clients:** the Clients list shows one row per *enrollment*, so a person with an
  individual pack + a cohort enrollment appears twice (both link to the same client).
- **Create defaults to Individual** with no choice; cohort membership is a separate free-text
  form that doesn't reuse existing clients.
- **Goals feel conflated:** `cohorts.goal` (shared theme) vs `enrollments.goal` (a person's goal
  within a program) are different things shown without clear labels.
- **Cohort-only people aren't provisioned in Memberstack** (only the individual create path
  provisions), so they can't resolve in the portal.

**Target (approved vision):** Clients = people; each client is ONE list row (slim: name + active
dot + program badges) that **expands** to per-program sub-rows. The client detail becomes an
**identity card (person-bound: name/email/login link) + vertical per-program tabs** (Individual /
Cohort, extensible), where the **selected tab drives everything below** (that enrollment's status,
goal, sessions, content). Cohort tab is lighter (cohort link + their cohort goal + cohort schedule
snapshot + their in-cohort personal resources). Add-to-cohort becomes a picker of existing clients
(+ create-new). Create-client gains Individual / Cohort / Both with inline cohort pick.

**No schema changes required** — confirmed. `content_items` already carry `client_id`,
`program_id` (= enrollment id), `cohort_id`, `cohort_session_id`, `kind`; `insertClientRecording`
/ `attachRecordingToClient` already set `program_id` on new uploads (`lib/db.ts:462,482`). Status
/ goal / sessions already live per-enrollment. Only a one-time **data backfill** of legacy content
is needed (Stage 2).

---

## Build setup
- New branch off `main`: `client-cohort-disentangle` (isolate from `portal-external-hosting`).
  Do NOT touch the portal.js / docs files.
- `npm run build` must pass before any commit (pushing `main` deploys live; this branch won't
  until merged).
- Custom Next fork: consult `node_modules/next/dist/docs/` before relying on framework behavior.

## Stage 0 — Shared Memberstack provisioning helper (prerequisite)
Extract the inline provisioning block from `createClientWithEnrollment` (`lib/db.ts:261-276`) into
a reusable, idempotent helper:
```
ensureMemberProvisioned(client, {firstName?,lastName?,goal?,totalSessions?})
  → { client, provisionWarning?, memberProvisioned }
```
Guard on `!client.memberstack_id`; call existing `provisionMember` (`lib/memberstack.ts:53`, already
email-idempotent) + `setClientMemberstackId`. Refactor `createClientWithEnrollment` to call it
(behavior-preserving). Reused by the cohort + both create branches and by `addCohortMember`,
closing the "cohort-only people not provisioned" gap.

## Stage 1 — Clients list = one row per person (expandable)
**`lib/db.ts`** — new `listClientsWithEnrollments(statusFilter?)`, person-grained via SQL
aggregation (single round-trip; small table):
```sql
SELECT c.id, c.name, c.email,
       bool_or(e.status='active') AS any_active,
       array_agg(DISTINCT e.program_type) AS program_types,
       json_agg(json_build_object('id',e.id,'program_type',e.program_type,'goal',e.goal,
         'status',e.status,'total_sessions',e.total_sessions,'sessions_done',e.sessions_done,
         'cohort_id',e.cohort_id,
         'last_session_at',(SELECT max(sl.session_date) FROM session_logs sl WHERE sl.enrollment_id=e.id))
         ORDER BY e.created_at DESC) AS enrollments
FROM clients c JOIN enrollments e ON e.client_id=c.id
[WHERE e.status=${statusFilter}]        -- person appears if ANY enrollment matches
GROUP BY c.id,c.name,c.email
ORDER BY max(e.created_at) DESC
```
Add `ClientListRow` interface. Leave `listEnrollments` until Stage 5 cleanup.

**`app/api/clients/route.ts` GET** — call the new function; return `{ clients }`. Keep `?status=`.

**`app/clients/clients-view.tsx`** — read `data.clients`; drop the `TYPE_FILTERS` block + `typeFilter`
(person is the primary axis now); keep the status filter. Slim top row = name + active dot
(`any_active`) + program badges (reuse `TYPE_STYLES`, `clients-view.tsx:34`). Row becomes an
**expander** (`expandedId` state) with a small "Open →" to `/clients/${c.id}`. Expanded sub-rows =
one per `c.enrollments`: program badge, goal, status, `sessions_done` of `total_sessions`, last
session (`fmtDate`).

## Stage 2 — Client detail = identity card + vertical per-program tabs
**Content scoping (approved): scope per-tab by enrollment, with a backfill.**
- New `getEnrollmentContentByKind(enrollmentId, clientId, kind)`:
  `WHERE client_id=${clientId} AND program_id=${enrollmentId} AND kind=${kind}`.
- Cohort tab "in-cohort personal resources" = the cohort enrollment's own content via the same
  function (its `program_id` = the cohort enrollment id).
- **Backfill (one-time, run once against the DB):** for legacy client-content rows with
  `program_id IS NULL`, set `program_id` = that client's individual enrollment id. Ship as
  `db/backfill-content-program-id.sql` and run manually (mirrors how `schema.sql` ALTERs are
  applied). New uploads already set `program_id`.

**API** — add `GET /api/enrollments/[id]/detail` → `{ enrollment, logs, recordings, resources }`
(reuse `getEnrollment`, `getSessionLogs`, `getEnrollmentContentByKind`, and the R2-signing pattern
at `app/api/clients/[id]/route.ts:34-36`; cohort enrollments → `logs: []`). Slim
`GET /api/clients/[id]` to `{ client, enrollments }`. Tabs **lazy-load** their own detail on first
activation (mirrors existing lazy `CohortInfo` / `PastPackRow`).

**`app/clients/[id]/detail-view.tsx`** — refactor `ClientDetailView`:
- **Identity card** (person-bound, always visible): lift name/email/`CopyLoginLink`
  (`detail-view.tsx:106-111`) into a standalone white card (`bg-white rounded-2xl border
  border-gold/20 p-6`) that scales with content.
- **Vertical tab rail**: one tab per enrollment the client HAS (label "Individual"/"Cohort";
  disambiguate a second same-type pack by goal snippet, or leave older packs in `PastPacks`).
  Default to the individual enrollment; **hide tabs for programs they don't have**. Visual
  continuity: active tab shares the body's white surface (inactive tabs on `bg-petal`) so identity
  card + active tab + body read as one white card.
- **Active tab drives the body** (fed by the lazy `/api/enrollments/[id]/detail`):
  - Move the metadata line + goal + `EditEnrollmentModal` (`detail-view.tsx:114-150`) into the tab
    body header (status/goal/sessions from the selected enrollment; edits via existing
    `PATCH /api/enrollments/[id]`).
  - **Individual tab** = current individual branch (`detail-view.tsx:422-434`): `SessionLogger`,
    `NextSessionEditor`, `CalendarLinkEditor`, `SessionHistory`, + the two `ClientContentSection`s.
  - **Cohort tab (lighter)** = `CohortInfo` (`detail-view.tsx:453`) schedule/progress + cohort link;
    the cohort enrollment's `goal` labeled "Their goal in this cohort"; one `ClientContentSection`
    for their in-cohort personal resources; a "Manage in Cohorts →" link. No logger/next-session/
    calendar.
- Keep `StartNewPack`, `PastPacks`, `DangerZone` (person-level) below the tabs.

## Stage 3 — Add-to-cohort: existing-client picker + provision + dupe guard
**`lib/schemas.ts`** — `AddCohortMemberSchema`: add optional `clientId` (uuid); `.refine` require
`clientId` OR (`name` && `email`) (mirror `AttachRecordingSchema` refine).
**`lib/db.ts`** — `listClientsForPicker()` (`SELECT id,name,email FROM clients ORDER BY name`);
rewrite `addCohortMember` (`lib/db.ts:685-711`) to accept `{cohortId, clientId?, name?, email?, goal}`:
resolve client (by `clientId`, else `findClientByEmail`, else insert) → **dupe guard**
(`SELECT 1 FROM enrollments WHERE client_id=… AND cohort_id=…` → return `{alreadyMember:true}`) →
`ensureMemberProvisioned` (Stage 0) → insert the cohort enrollment.
**`app/api/cohorts/[id]/members/route.ts`** — pass `clientId`; surface
`alreadyMember`/`reusedClient`/`provisionWarning`.
**`RosterSection` in `app/cohorts/[id]/detail-view.tsx:658`** — searchable existing-client picker
(fetch `/api/clients/picker`, filter name/email) + "Create new" fallback (keep name/email/goal
inputs). Show the `alreadyMember` / reused / provision notices (pattern at `detail-view.tsx:677`).

## Stage 4 — Create-client form: Individual / Cohort / Both
**`lib/schemas.ts`** — `CreateClientSchema`: add `programType: enum(individual|cohort|both)
default individual` + optional `cohortId`; `.refine` `cohortId` present when cohort|both.
**`lib/db.ts`** — extend `createClientWithEnrollment` to branch: always dedupe/create client +
`ensureMemberProvisioned`; `individual` → `addEnrollment`; `cohort` → dupe-guarded cohort
enrollment (reuse Stage 3 core); `both` → both.
**`app/api/clients/route.ts` POST** — pass `programType`/`cohortId`.
**`NewClientModal` (`clients-view.tsx:173`)** — 3-way `programType` pill toggle (reuse the pattern
at `detail-view.tsx:239`); when cohort|both, a cohort `<select>` (fetch `/api/cohorts`,
`listCohorts` exists). Post `programType` + `cohortId`.

## Stage 5 — Goal labels + language + cleanup
- Cohort tab labels: "Their goal in this cohort" (enrollment goal) vs "Cohort goal (shared)"
  (cohort goal). Keep nav "Clients"/"Cohorts"; "member" stays only in cohort roster context.
- Remove `listEnrollments` + unused `EnrollmentListRow` once nothing imports them (grep first).

---

## Critical files
- `lib/db.ts` — list query, per-enrollment content, dupe guard, provisioning helper,
  `addCohortMember`/`createClientWithEnrollment` branching, picker.
- `app/clients/clients-view.tsx` — person rows + expand + new-client modal (type/cohort picker).
- `app/clients/[id]/detail-view.tsx` — identity card + vertical per-program tabs.
- `app/cohorts/[id]/detail-view.tsx` — roster existing-client picker.
- `lib/schemas.ts` — `CreateClientSchema` (programType+cohortId), `AddCohortMemberSchema` (clientId).
- Routes: `app/api/clients/route.ts`, `app/api/clients/[id]/route.ts`,
  `app/api/cohorts/[id]/members/route.ts`, new `app/api/enrollments/[id]/detail/route.ts`.
- `db/backfill-content-program-id.sql` — one-time legacy content backfill note.

## Verification (end-to-end, after the single pass)
1. `npm run build` passes.
2. Run the content backfill SQL; confirm legacy recordings now carry `program_id`.
3. **List:** a person with individual + cohort shows exactly ONE row, both program badges, one
   active dot; expanding shows two sub-rows with distinct goals/progress; status filter still works.
4. **Detail tabs:** open that person → identity card once; Individual + Cohort tabs; switching tabs
   swaps status/goal/sessions/content; logging a session on Individual increments only that
   enrollment; Cohort tab shows the cohort schedule + their cohort goal + their in-cohort resources,
   no logger.
5. **Add to cohort:** pick an existing individual client → reuses their `clients` row + Memberstack
   id, creates a cohort enrollment; re-adding same person → blocked ("already in cohort"); a
   brand-new cohort-only person gets `clients.memberstack_id` set and resolves in the portal
   (`getClientByMemberstackId`).
6. **Create Both + cohort:** one clients row, one individual + one cohort enrollment, provisioned;
   appears as one list row (both badges), both detail tabs, and on the chosen cohort roster.
7. Portal regression: an individual-only client still renders (the earlier `ind-*` portal work is
   untouched).

## Out of scope (flagged, not done)
- The cohort **portal** field gaps (`docs/portal-field-reference.md` §D) are separate.
- Library-content surfacing in the portal (Pass 4 in `docs/portal-test-checklist.md`) is separate.
