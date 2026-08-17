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
2. **Plan detection** — reads `member.planConnections[]`, counting only **active,
   non-cancelled** connections. Memberstack keeps cancelled/expired connections on the
   member, so both the script and the API filter them out; a lapsed member keeps their
   account and simply sees the upsell again. Nothing is ever deleted.
   | Plan | Plan ID | Unlocks |
   |---|---|---|
   | Individual coaching | `pln_individual-coaching-nkaa080g` | `#portal-coaching` panel (`ind-*` fields) |
   | Cohort | `pln_cohort-qbab0892` | `#portal-cohort` panel (`cohort-*` fields) |
   | Neither | — | `#portal-upsell` |
3. **One API call** — `GET /api/portal` with `Authorization: Bearer <_ms-mid cookie>`. Returns
   individual and cohort data in one payload (see §H), **gated by plan**: the API checks the
   member's active plans and omits what they aren't entitled to — an unentitled individual
   panel comes back as the empty-but-valid shape, an unentitled cohort comes back `null`.
   Gating is enforced server-side, not just hidden in the browser.
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
| `ind-next-session-schedule` | toggle + href | `client.next_session_at` / `client.calendar_url` | shown when NO valid date | the "schedule a session" prompt. Also receives `href` = `calendar_url` — harmless on a div, useful if the element IS the link |
| `ind-schedule-link` | href | `client.calendar_url` | sets `href` | **optional, add to Webflow when wanted.** Put it on the `<a>` itself when the CTA is a button *inside* the `-schedule` block. Unset in Webflow → simply never matches; the button keeps its authored href |
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
| `ind-recording-date` | item | `recordings[].recorded_at` | `"Month Day"` (e.g. June 3) | ⚠️ currently `content_items.created_at` (when it was uploaded), not a true recorded-on date — accurate for recordings added near the session, same-day for a bulk backfill. Field name is future-proof: add a real column later and only the API line changes. |
| `ind-recording-icon` | icon | `recordings[].file_type` | media icon, see §I | |
| _(recording card click)_ | — | `recordings[].public_url` + `.file_type` | opens modal (video/audio) or new tab (pdf) | whole card is clickable; default type `video` |
| `ind-files-list` | list | `data.files[]` | repeater of file cards | |
| `ind-files-empty` | empty | — | shown when `files[]` empty | |
| `ind-file-title` | item | `files[].title` | title | |
| `ind-file-description` | item | `files[].description` | description | blank if none |
| `ind-file-date` | item | `files[].uploaded_at` | `"Month Day"` (e.g. June 3) | ⚠️ upload date, same caveat as `ind-recording-date` — see §I |
| `ind-file-icon` | icon | `files[].file_type` | media icon, see §I | |
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
| `cohort-sessions-completed` | text | `cohort.sessions_done` | number | ✅ from `cohorts.current_session` (group progress, advanced manually by the coach); `"0"` if null; `eachEl` |
| `cohort-sessions-total` | text | `cohort.total_sessions` | number | ✅ `"0"` if null; `eachEl` |
| `cohort-session-display` | toggle | (computed) | the "next session" block; shown only when a future session exists | ✅ derived — no cohort-level `next_session_at` column; the script picks the earliest session still ahead. No `-schedule` counterpart: cohort dates are coach-set, so the block just hides. |
| `cohort-next-session-date` | text | (computed) | `"Month Day"` | ✅ only meaningful inside `-display` |
| `cohort-next-session-time` | text | (computed) | `"h:mm AM/PM TZ"` | ✅ local time + tz abbrev |
| `cohort-sessions-list` | list | `cohort.sessions[]` | repeater of cohort session cards | ✅ |
| `cohort-sessions-empty` | empty | — | shown when no sessions | ✅ |
| `cohort-session-number` | item | `sessions[].session_number` | `"Session N"` | ✅ |
| `cohort-session-title` | item | `sessions[].title` | free-text session name | ✅ |
| `cohort-session-prompt` | item | `sessions[].prompt_text` | discussion prompt | ✅ |
| `cohort-session-locked` | toggle | (computed) | shown when `today < session_date` | ✅ lock logic |
| `cohort-session-unlocked` | toggle | (computed) | shown when session date has passed | ✅ |
| `cohort-session-date` | item | `sessions[].session_date` | `"Year Month Day"` | ✅ only set on unlocked cards |
| `cohort-files-list` | list | `cohort.files[]` | repeater of cohort-wide files | ✅ |
| `cohort-files-empty` | empty | — | shown when no cohort-wide files | ✅ |
| `cohort-file-title` | item | `files[].title` | title | ✅ |
| `cohort-file-description` | item | `files[].description` | description | blank if none |
| `cohort-file-date` | item | `files[].uploaded_at` | `"Month Day"` (e.g. June 3) | ⚠️ upload date — see §I |
| `cohort-file-icon` | icon | `files[].file_type` | media icon, see §I | |
| `cohort-my-files-list` | list | `cohort.my_files[]` | repeater of this member's private cohort files | ✅ |
| `cohort-my-files-empty` | empty | — | shown when the member has none | ✅ |
| `cohort-my-file-title` | item | `my_files[].title` | title | ✅ |
| `cohort-my-file-description` | item | `my_files[].description` | description | ✅ blank if none |
| `cohort-my-file-date` | item | `my_files[].uploaded_at` | `"Month Day"` | ⚠️ upload date — see §I |
| `cohort-my-file-icon` | icon | `my_files[].file_type` | media icon, see §I | |

**Lock rule:** a session is locked until its own `session_date` passes — UNLESS `cohort.end_date`
has passed, which unlocks every session at once. `end_date` is optional; leave it empty for an
open-ended cohort and locking stays purely per-session.

**The three cohort file shapes** are one table (`content_items`) distinguished by which columns
are set — no separate tables:

| Columns set | Shows up as |
|---|---|
| `cohort_id` + `cohort_session_id` | that session's files (inside the session card) |
| `cohort_id`, `client_id` NULL | `cohort.files[]` — cohort-wide, everyone sees them |
| `cohort_id` + `client_id` | `cohort.my_files[]` — private to that member |

---

## D. Per-session cohort recordings

Resolved: **one recording per session.** An unlocked session card is clickable and opens
that session's recording in the media modal.

| Field | Type | API source | Notes |
|---|---|---|---|
| _(cohort session card click)_ | — | `sessions[].recording_url` + `.file_type` | whole card is clickable when a recording exists; opens the modal (video/audio). Locked cards are never clickable, and neither are sessions with no recording — the script guards on the url being present. |

**Which file becomes the recording:** the newest non-PDF (audio or video) file attached to
that session. `kind` can't be used to pick it — `insertCohortContent` never sets that
column, so every cohort row carries the `'recording'` default. Files are ordered
`created_at DESC`, so re-uploading supersedes the previous recording without deleting it.

PDFs are never treated as the recording. Every attached file — including the one chosen as
the recording, and any older media — still appears in `sessions[].files[]`, so nothing is
hidden by this choice.

**To replace a session's recording:** upload the new one to that session. It becomes the
recording immediately by virtue of being newest; the old one stays in `files[]`.

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
    "program_type": "individual",   // or null
    "calendar_url": "https://cal.com/…"  // enrollment's own link, else NEXT_PUBLIC_BOOKING_URL, else null
  },
  "sessions": [                     // oldest session_number = 1
    { "session_date": "2026-06-01", "next_actions": "string", "session_number": 1 }
  ],
  "recordings": [
    { "title": "string", "session_label": "string|null",
      "recorded_at": "2026-06-01T18:22:00Z",  // = content_items.created_at (upload time)
      "public_url": "https://…signed…", "file_type": "video|audio|pdf" }
  ],
  "files": [
    { "title": "string", "description": "string|null",
      "uploaded_at": "2026-06-01T18:22:00Z",  // = content_items.created_at (upload time)
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
  "end_date": "2026-08-01T23:59:59Z|null",  // passed → every session unlocks
  "sessions_done": 2,                // from cohorts.current_session
  "total_sessions": 4,
  "member_goal": "string",
  "sessions": [
    { "session_number": 1,
      "session_date": "2026-06-01|null",
      "title": "string",
      "prompt_text": "string",
      "recording_url": "https://…signed…|null",  // newest non-PDF file on this session
      "file_type": "video|audio|null",
      "files": [                     // every attached file, recording included
        { "title": "string", "description": "string|null",
          "uploaded_at": "2026-06-01T18:22:00Z",
          "public_url": "https://…signed…", "file_type": "video|audio|pdf" }
      ] }
  ],
  "files": [                         // cohort-wide (client_id NULL)
    { "title": "string", "description": "string|null",
      "uploaded_at": "2026-06-01T18:22:00Z",
      "public_url": "https://…signed…", "file_type": "video|audio|pdf" }
  ],
  "my_files": [                      // private to this member within the cohort
    { "title": "string", "description": "string|null",
      "uploaded_at": "2026-06-01T18:22:00Z",
      "public_url": "https://…signed…", "file_type": "video|audio|pdf" }
  ]
}
```

**Linked client but NO individual enrollment** — individual payload is empty-but-valid, cohort
still surfaces:
```jsonc
{
  "client": { "goal": "", "total_sessions": null, "sessions_done": null,
              "next_session_at": null, "program_type": null,
              "calendar_url": "https://…|null" },  // global booking link still sent — a
                                                   // member with no pack can still book
  "sessions": [], "recordings": [], "files": [],
  "cohort": { /* … or null */ }
}
```

---

## I. Media icons + item dates

### Icons

Four card types carry a media icon: `ind-recording-icon`, `ind-file-icon`,
`cohort-file-icon`, `cohort-my-file-icon`. All behave identically.

The element is a **container the script fills** — leave it empty in Webflow:

```html
<span data-field="ind-recording-icon" class="media-icon"></span>
```

`portal.js` writes an inline [Iconoir](https://iconoir.com) SVG into it based on that item's
`file_type`, and stamps `data-media-type` on the element:

| `file_type` | Icon | Attribute set |
|---|---|---|
| `audio` | microphone | `data-media-type="audio"` |
| `video` | media-video | `data-media-type="video"` |
| `pdf` | page | `data-media-type="pdf"` |

`media_type` is DB-constrained (`db/schema.sql:8`) to exactly these three, so there is no
fallback case — an unrecognised type renders **no icon** rather than a broken one.

**Styling.** ⚠️ The SVG strokes are **hardcoded `#ffffff`**, not `currentColor`. A CSS `color`
rule will NOT change them — that is the deliberate tradeoff for the icons rendering without
any Webflow styling at all (nothing set `color` on the wrapper, so `currentColor` left them
invisible). `width`/`height` on the `<svg>` can still be overridden, and the stamped
`data-media-type` attribute is still available for per-type styling of the container:

```css
.media-icon svg { width: 1rem; height: 1rem; }
.media-icon[data-media-type="pdf"] { background: #fef3c7; }  /* container, not stroke */
```

Accent colours (e.g. the petal accent) therefore apply to **buttons and CTAs**, which are
plain Webflow elements, not to these icons.

**Why inline rather than a font or CDN:** a blocked stylesheet would silently strip every
icon, which is the same invisible-failure mode this whole reference exists to prevent.
Inlining costs ~1KB and has no external dependency.

### Dates

`ind-recording-date`, `ind-file-date`, `cohort-file-date`, and `cohort-my-file-date` all
render the **short** form — `"June 3"`, no year — since these are recent items on space-tight
cards. Session dates keep the long `"Year Month Day"` form.

⚠️ **All four are `content_items.created_at`** — when the item was uploaded to the dashboard,
not a date the content itself claims. Accurate for material shared near its session; a bulk
backfill makes every card show the same day. The field names are deliberately neutral, so
adding a real date column later changes only the API line, not the Webflow attribute.

---

_Keep this in sync with `public/portal.js` (and its `public/portal.staging.js` copy) and
`app/api/portal/route.ts` whenever fields change._
