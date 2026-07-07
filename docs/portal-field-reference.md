# Coaching Portal — Field Reference

**The single source of truth for the Webflow coaching portal's `data-field` attributes.**

This maps every attribute the portal script reads → the data it carries → how it should display.
Hold the Webflow project against this. Derived from the actual code, not memory:
- Script: `public/portal.staging.js` (post-`ind-` rename) / `public/portal.js`
- API: `app/api/portal/route.ts` (`GET /api/portal`)
- Data: `lib/db.ts` (`getSessionLogs`, `getClientContentByKind`, `getCohortForPortal`)

> **Attribute vs. ID.** Most hooks are `data-field="name"` (styled `[data-field="name"]`).
> Three are Webflow **element IDs** used with `getElementById`: `portal-upsell`,
> `portal-coaching`, `portal-cohort`. They are NOT interchangeable — see §A.

---

## A. How the portal loads

1. **Memberstack gate** — `window.$memberstackDom.getCurrentMember()`. No member → show
   `#portal-upsell`, stop.
2. **Plan detection** — reads `member.planConnections[].planId`:
   | Plan | Plan ID | Unlocks |
   |---|---|---|
   | Individual coaching | `pln_individual-coaching-nkaa080g` | `#portal-coaching` panel (`ind-*` fields) |
   | Cohort | `pln_cohort-qbab0892` | `#portal-cohort` panel (`cohort-*` fields) |
   | Neither | — | `#portal-upsell` |
3. **One API call** — `GET /api/portal` with `Authorization: Bearer <_ms-mid cookie>`. Returns
   BOTH individual and cohort data in one payload (see §H).
4. **Render** — `render(data)` writes values into the DOM by `data-field`. Token is verified
   server-side (`verifyMemberToken`); the member ID alone is never trusted.

**The three gate containers (element IDs, not data-fields):**
| ID | Shown when |
|---|---|
| `portal-upsell` | not signed in, or no individual/cohort plan |
| `portal-coaching` | has individual plan (or is the active tab) |
| `portal-cohort` | has cohort plan (or is the active tab) |

**Why `ind-` / `cohort-` split:** individual and cohort share the same panel visually, so the
individual fields were prefixed `ind-` to guarantee no attribute collision with `cohort-*`.

---

## B. Individual coaching fields — `ind-*`

Source object: `data.client` (single object) + `data.sessions[]` / `data.recordings[]` /
`data.files[]` (arrays). **Type** legend: `text` = textContent set; `toggle` = shown/hidden as a
pair; `list`/`empty` = repeater container + its empty-state sibling; `item` = field inside a
repeated card (the list's first child is the template).

| data-field | Type | API source | Displays / format | Notes |
|---|---|---|---|---|
| `ind-goal` | text | `client.goal` | goal text | blank string if none |
| `ind-sessions-completed` | text | `client.sessions_done` | number | defaults `"0"` if null; matched by `eachEl` (may appear multiple places) |
| `ind-sessions-total` | text | `client.total_sessions` | number | defaults `"0"` if null; `eachEl` |
| `ind-next-session-display` | toggle | `client.next_session_at` | shown when a valid date exists | the "you have a session booked" block |
| `ind-next-session-schedule` | toggle | `client.next_session_at` | shown when NO valid date | the "schedule a session" prompt |
| `ind-next-session-date` | text | `client.next_session_at` | `"Month Day"` (e.g. July 9) | only meaningful inside `-display` |
| `ind-next-session-time` | text | `client.next_session_at` | `"h:mm AM/PM TZ"` | local time + tz abbrev |
| `ind-sessions-list` | list | `data.sessions[]` | repeater of session cards | hidden if empty |
| `ind-sessions-empty` | empty | — | shown when `sessions[]` empty | |
| `ind-session-number` | item | `sessions[].session_number` | number (oldest = 1) | inside session card |
| `ind-session-date` | item | `sessions[].session_date` | `"Year Month Day"` | inside session card |
| `ind-session-notes` | item | `sessions[].next_actions` | the next-actions text | ⚠️ maps to `next_actions`, NOT internal notes (notes/coach_actions are never sent) |
| `ind-recordings-list` | list | `data.recordings[]` | repeater of recording cards | |
| `ind-recordings-empty` | empty | — | shown when `recordings[]` empty | |
| `ind-recording-title` | item | `recordings[].title` | title | |
| `ind-recording-label` | item | `recordings[].session_label` | session label | blank if none |
| _(recording card click)_ | — | `recordings[].public_url` + `.file_type` | opens modal (video/audio) or new tab (pdf) | whole card is clickable; default type `video` |
| `ind-files-list` | list | `data.files[]` | repeater of file cards | |
| `ind-files-empty` | empty | — | shown when `files[]` empty | |
| `ind-file-title` | item | `files[].title` | title | |
| `ind-file-description` | item | `files[].description` | description | blank if none |
| _(file card click)_ | — | `files[].public_url` + `.file_type` | opens modal or new tab (pdf) | default type `audio` |

**Repeater mechanics (applies to every `*-list`):** the list's **first child** is used as the
card template — style/populate it in Webflow; the script clones it per item, strips its `id`, and
fills the `item` fields. Keep exactly one template child.

---

## C. Cohort fields — `cohort-*` (working today)

Source object: `data.cohort` (object or null) + `data.cohort.sessions[]`.

| data-field | Type | API source | Displays / format | Status |
|---|---|---|---|---|
| `cohort-my-goal` | text | `cohort.member_goal` | member's cohort goal | ✅ |
| `cohort-zoom-link` | href | `cohort.zoom_link` | sets `href` (only if url present) | ✅ |
| `cohort-telegram-link` | href | `cohort.telegram_link` | sets `href` | ✅ |
| `cohort-sessions-list` | list | `cohort.sessions[]` | repeater of cohort session cards | ✅ |
| `cohort-sessions-empty` | empty | — | shown when no sessions | ✅ |
| `cohort-session-number` | item | `sessions[].session_number` | `"Session N"` | ✅ |
| `cohort-session-prompt` | item | `sessions[].prompt_text` | discussion prompt | ✅ |
| `cohort-session-locked` | toggle | (computed) | shown when `today < session_date` | ✅ lock logic |
| `cohort-session-unlocked` | toggle | (computed) | shown when session date has passed | ✅ |
| `cohort-session-date` | item | `sessions[].session_date` | `"Year Month Day"` | ✅ only set on unlocked cards |

**Lock rule (current):** a session is locked until its own `session_date` passes. (There's also
an intended "whole cohort ended → unlock everything" rule, but it depends on a field the API
doesn't send yet — see §D.)

---

## D. ⚠️ Cohort GAPS — script reads these, API does NOT send them

These render **blank / empty / non-functional** today. Not bugs in Webflow — the data isn't in
the response. Each with its fix path:

| Field / behavior | Symptom | Fix path |
|---|---|---|
| `cohort-session-title` ← `session.title` | title blank; unlocked card title falls back to `"Session N"` | **Easiest.** `title` column EXISTS on `cohort_sessions`; the route's `buildCohortObject` projection just drops it. Add `title` to the emitted per-session object in `app/api/portal/route.ts`. |
| `session.recording_url` + `session.file_type` | unlocked cohort sessions are never clickable (no play) | API returns no per-session recording. Needs a recording source wired to cohort sessions, then emitted. |
| `cohort.end_date` | "cohort ended unlocks all" branch never fires; locking is purely per-session-date | No `end_date` column on the cohort. Add column + emit it, or drop the branch from the script. |
| `cohort-files-list` ← `cohort.files[]` | list always shows empty state | API groups files per-session only; no cohort-wide `files[]` returned. Add a query for `cohort_session_id IS NULL` files + emit. |
| `cohort-my-files-list` ← `cohort.my_files[]` | list always shows empty state | No per-member cohort-files concept in the API. Needs design + query. |
| `session.files[]` (gap other direction) | API DOES attach per-session files, script never renders them | `filesBySession` → `cohort.sessions[].files[]` IS in the payload, but `fillCohortSessionCard` doesn't render them. Add rendering in the script if per-session files should show. |

**Item/empty sub-fields of those two dead lists** (won't populate until the lists get data):
- Under `cohort-files-list`: `cohort-files-empty` (empty state), `cohort-file-title` (item).
- Under `cohort-my-files-list`: `cohort-my-files-empty` (empty state), `cohort-my-file-title` and
  `cohort-my-file-description` (item fields).

---

## E. Media modal fields (shared, single DOM instance)

Opened by any recording / file / (future) cohort card. One modal serves all. PDFs bypass the
modal entirely (open in a new tab).

| data-field | Role |
|---|---|
| `media-modal` | modal container; `display:flex` when open, locks body scroll |
| `modal-title` | text — the item title |
| `modal-video` | wrapper shown for video items (`display:block`) |
| `modal-audio` | wrapper shown for audio items |
| `modal-video-player` | the `<video>`; script sets `.src` (cleared on close) |
| `modal-audio-player` | the `<audio>`; script sets `.src` (cleared on close) |
| `modal-download` | download link; `href` set to the item url |
| `modal-close` | close button (also closes on backdrop click / Escape) |

---

## F. Tab + gate fields

| data-field | Role |
|---|---|
| `plan-tabs-header` | the tab bar; **only shown when the member has BOTH plans**, else hidden |
| `tab-individual` | tab button → shows `#portal-coaching`, hides `#portal-cohort` |
| `tab-cohort` | tab button → shows `#portal-cohort`, hides `#portal-coaching` |

- Active tab gets the `is-active` class (style it in Webflow). Default active = individual.
- Single-plan members never see the header; their one owned panel just shows.
- **Current state / TODO:** the Webflow tab components aren't fully built yet — this is on
  Russell's list. Until built, the both-plans experience can't be fully tested (see checklist).

---

## G. Error field

| data-field | Role |
|---|---|
| `portal-error` | error container; shown on failure |
| `message` (inside `portal-error`) | the error copy |

Copy by case: **401** "Your session has expired. Please sign in again." · **404** "We couldn't
find your coaching portal. Please contact your coach." · **other/network** "Something went wrong
loading your portal." If `portal-error` doesn't exist in the DOM, errors log to console as
`[portal] ...` instead.

---

## H. Raw API response shape (`GET /api/portal`)

Self-contained reference for debugging. `public_url`s are fresh signed R2 URLs. Internal
`notes`/`coach_actions` are NEVER included.

**Member with an individual enrollment (and optionally a cohort):**
```jsonc
{
  "client": {
    "goal": "string",
    "total_sessions": 12,           // or null
    "sessions_done": 4,             // or null
    "next_session_at": "2026-07-09T15:00:00Z", // or null
    "program_type": "individual"    // or null
  },
  "sessions": [                     // oldest session_number = 1
    { "session_date": "2026-06-01", "next_actions": "string", "session_number": 1 }
  ],
  "recordings": [
    { "title": "string", "session_label": "string|null",
      "public_url": "https://…signed…", "file_type": "video|audio|pdf" }
  ],
  "files": [
    { "title": "string", "description": "string|null",
      "public_url": "https://…signed…", "file_type": "video|audio|pdf" }
  ],
  "cohort": { /* object below, or null */ }
}
```

**`cohort` object (or `null` if the member has no cohort enrollment):**
```jsonc
{
  "id": "string",
  "name": "string",
  "zoom_link": "https://…|null",     // from cohort.zoom_url
  "telegram_link": "https://…|null", // from cohort.telegram_url
  "member_goal": "string",
  "sessions": [
    { "session_number": 1,
      "session_date": "2026-06-01|null",
      "prompt_text": "string",
      "files": [                     // ⚠️ present in payload, not rendered by script yet (§D)
        { "title": "string", "public_url": "https://…signed…", "file_type": "video|audio|pdf" }
      ] }
  ]
  // NOTE: no `end_date`, no per-session `title`/`recording_url`/`file_type`,
  //       no top-level `files`/`my_files` — see §D.
}
```

**Linked client but NO individual enrollment** — individual payload is empty-but-valid, cohort
still surfaces:
```jsonc
{
  "client": { "goal": "", "total_sessions": null, "sessions_done": null,
              "next_session_at": null, "program_type": null },
  "sessions": [], "recordings": [], "files": [],
  "cohort": { /* … or null */ }
}
```

---

_Keep this in sync with `public/portal.js` and `app/api/portal/route.ts` whenever fields change._
