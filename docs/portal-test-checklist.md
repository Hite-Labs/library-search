# Coaching Portal — Test Checklist

Where testing stands after the `ind-`/`cohort-` `data-field` split. Walk these passes in order.
Field-level expectations live in **`portal-field-reference.md`** — this file is the "did it
actually work" checklist. Copy a pass, check the boxes, note failures.

**The silent-fail signature to watch for everywhere:** a section renders **blank with no console
error**. That almost always means a `data-field` name in Webflow doesn't match the script (a
typo, a missing `ind-` prefix, or an old name). It is the #1 thing this whole rename is about.

---

## 0. Pre-flight (do once per test session)

- [ ] Confirm which script block is live in the Webflow embed: the **staging (renamed, `ind-*`)**
      block is active, the old-names block commented out.
- [ ] Memberstack mode matches the domain you're testing on:
      - Production domain → Memberstack **Live** mode, backend uses live key. ✅ tokens verify.
      - `sys-society-branding.webflow.io` staging → currently **Test** mode. ⚠️ test-mode tokens
        will **401** against the live-key production API. Flip that domain to Live mode first, or
        test on the production domain, or the portal will just show "session expired."
- [ ] Open browser DevTools console on the portal page. Confirm:
  - [ ] `window.$memberstackDom` is defined (not `undefined`).
  - [ ] No `[portal] …` errors logged.
  - [ ] Network tab shows `GET /api/portal` → **200** (not 401/404). Click it → inspect the JSON;
        this is your ground truth for what SHOULD render.

---

## Pass 1 — Individual-plan user

**Setup:** a Memberstack user with ONLY `pln_individual-coaching-nkaa080g`, linked to a dashboard
client that has an individual enrollment with sessions + recordings + files.

Cross-check each rendered value against what's in the dashboard for that user (and against the
`/api/portal` JSON in the Network tab).

**Gate**
- [ ] `#portal-coaching` panel is visible; `#portal-upsell` hidden; `#portal-cohort` hidden.
- [ ] No tab header (`plan-tabs-header` hidden) — single-plan user.

**Header / progress**
- [ ] `ind-goal` shows the client's goal.
- [ ] `ind-sessions-completed` = sessions done (dashboard value; `0` if none).
- [ ] `ind-sessions-total` = total sessions (`0` if none).
- [ ] Next session block: if a next session is set → `ind-next-session-display` visible with
      `ind-next-session-date` (Month Day) and `ind-next-session-time` (time + tz) correct;
      `ind-next-session-schedule` hidden.
- [ ] If NO next session → `ind-next-session-schedule` visible, `-display` hidden.

**Sessions list**
- [ ] If sessions exist: `ind-sessions-list` visible, `ind-sessions-empty` hidden; one card per
      session; oldest = "Session 1".
- [ ] Per card: `ind-session-number`, `ind-session-date` (formatted), `ind-session-notes` (this
      is the **next-actions** text — confirm it's NOT internal coach notes).
- [ ] If no sessions: `ind-sessions-empty` visible, list hidden.

**Recordings**
- [ ] `ind-recordings-list` populated (or `ind-recordings-empty` if none).
- [ ] Per card: `ind-recording-title`, `ind-recording-label`.
- [ ] Click a video/audio recording → modal opens, plays; `modal-title` correct; `modal-download`
      link works. Escape / backdrop / `modal-close` all close it.
- [ ] Click a PDF recording → opens in a new tab (no modal).

**Files**
- [ ] `ind-files-list` populated (or `ind-files-empty`).
- [ ] Per card: `ind-file-title`, `ind-file-description`.
- [ ] Click behavior as recordings (modal for audio/video, new tab for pdf).

- [ ] **Silent-fail sweep:** every section above either showed data or its correct empty state —
      nothing blank-without-reason.

---

## Pass 2 — Cohort-plan user

**Setup:** a Memberstack user with ONLY `pln_cohort-qbab0892`, linked to a client with a cohort
enrollment (a cohort that has dated sessions with prompts).

**Gate**
- [ ] `#portal-cohort` visible; `#portal-coaching` hidden; `#portal-upsell` hidden.
- [ ] No tab header (single plan).

**Cohort content (should work)**
- [ ] `cohort-my-goal` shows the member's cohort goal.
- [ ] `cohort-zoom-link` / `cohort-telegram-link` hrefs set (click → correct destinations).
- [ ] `cohort-sessions-list` populated (or `cohort-sessions-empty`).
- [ ] Per session card: `cohort-session-number` = "Session N", `cohort-session-prompt` = prompt.
- [ ] Locked vs unlocked: sessions whose `session_date` is in the future show
      `cohort-session-locked`; past-dated show `cohort-session-unlocked` with `cohort-session-date`.

**⚠️ Expected gaps — do NOT flag these as bugs** (API doesn't send this data yet; see reference §D)
- [ ] `cohort-session-title` blank — expected (route drops `title`).
- [ ] Unlocked cohort sessions not clickable / no recording — expected (no `recording_url`).
- [ ] `cohort-files-list` shows empty state — expected (no `cohort.files[]`).
- [ ] `cohort-my-files-list` shows empty state — expected (no `cohort.my_files[]`).
- [ ] "Whole cohort ended unlocks all" doesn't happen — expected (no `end_date`).

> When you're ready to close these gaps, ping me — most need a small change to
> `buildCohortObject` in `app/api/portal/route.ts` (see reference §D for the per-field fix path).

- [ ] **Silent-fail sweep** on the working cohort fields.

---

## Pass 3 — Both-plans user + tabs

**Setup:** take one test user and give them BOTH plans in Memberstack; ensure the linked client
has both an individual enrollment and a cohort enrollment.

**Blocker to note first:** the Webflow **tab components may not be fully built yet** (reference
§F). If the tab bar / panels aren't built, this pass is partially blocked — build the tab
components in Webflow, then run it.

- [ ] `plan-tabs-header` is now visible (both plans present).
- [ ] Default state: individual tab active, `#portal-coaching` shown, `#portal-cohort` hidden.
- [ ] `tab-individual` has `is-active` styling; `tab-cohort` does not.
- [ ] Click `tab-cohort` → `#portal-cohort` shows, `#portal-coaching` hides, active styling swaps.
- [ ] Click `tab-individual` → switches back.
- [ ] Both panels still show their correct data (re-verify a couple of fields from each — it's the
      same single `/api/portal` payload driving both).

---

## Pass 4 — Library content (TBD / later)

Not scoped yet. Captured so it isn't forgotten.

- [ ] **Open question:** surface library / search content inside the portal (tie into the existing
      `/api/search` widget or a new section?). Decide the data source and which `data-field`s it
      needs, then extend the reference + this checklist.

---

## Data-setup notes (how to give a test user data to show)

For a portal to render anything, three layers must line up for the same person:

1. **Memberstack:** the user has the right plan(s) (`pln_individual-coaching-nkaa080g` and/or
   `pln_cohort-qbab0892`), and the domain you're testing on is authorized + in the right mode.
2. **Dashboard client link:** a `clients` row whose `memberstack_id` = that member's id (this is
   what `/api/portal` resolves the token to).
3. **The actual data:**
   - Individual: an `enrollments` row (`program_type='individual'`) with goal / totals / next
     session, plus `session_logs`, and `content_items` (`kind='recording'` and `kind='file'`).
   - Cohort: an `enrollments` row with a `cohort_id`, a cohort with `cohort_sessions` (dated, with
     prompts), and per-session `content_items` if testing files.

If the portal shows the empty-but-valid state (goal blank, all lists empty) but no error, the
member is linked but has no enrollment/data — add the rows above.

---

_Update this file as passes complete or the Webflow build progresses. The field expectations it
references are in `portal-field-reference.md`._
