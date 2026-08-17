# Open questions & follow-ups

Decisions that are blocked on someone, not on code. Each entry says **who** it's waiting on,
**why** it can't be settled in the repo, and **what unblocks it**.

Code-level roadmap items live in the plan/scope docs; this file is only for things that need
a human answer first. When one is resolved, move the decision into the relevant doc
(`portal-field-reference.md` for portal behaviour, a scope doc for build work) and delete the
entry here.

---

## Q-01 — What should the "Schedule New Session" button actually do?

**Waiting on:** Lindsay (via Russell) · **Raised:** 2026-08-17 · **Blocks:** the session
completion tile (Wave 1), and any in-portal booking CTA

### Why this isn't a code question

Booking a session is **not** contained in this system. For both individual coaching and
cohorts, scheduling involves steps in the wider business process — external calendar tooling,
and whatever Lindsay does around confirming and preparing for a session. The portal can point
a member at a destination, but it cannot own the workflow, and guessing at the destination
risks sending members somewhere that skips a step Lindsay depends on.

So the button's **label**, **destination**, and **whether it should differ between individual
and cohort members** all need Lindsay's answer before the tile is finalised.

### What the code already supports (so the answer isn't constrained by the build)

The plumbing shipped in `b8ae2a1` and is deliberately flexible:

- `enrollments.calendar_url` — a **per-client** booking link, editable today on
  `/clients/[id]` ("Calendar link").
- `NEXT_PUBLIC_BOOKING_URL` — a **global** fallback used when a client has none of their own.
- `GET /api/portal` returns `client.calendar_url` with that precedence (own link → global →
  `null`), so the portal and the dashboard always agree on which link a given client gets.
- `portal.js` applies it to `ind-next-session-schedule` and `ind-schedule-link`. When the API
  sends `null`, the script leaves whatever href Webflow authored **untouched**.

**Net: any of the answers below is reachable without new backend work.** Per-client links,
one global link, or a hardcoded Webflow href all work as-is.

### Questions for Lindsay

1. **Where should it go?** A booking page (Cal.com/Calendly/etc.), an email to her, a form,
   or somewhere else entirely?
2. **Same for everyone, or per client?** The system supports a different link per client —
   is that useful, or is one shared link simpler to run?
3. **Should cohort members see it at all?** Cohort session dates are fixed by the coach, so
   "schedule a session" may be meaningless there — or it may mean something different, like
   requesting a 1:1 on top of the cohort. Today the cohort panel has **no** schedule CTA at
   all (`portal.js` hides the block when nothing is upcoming, with no counterpart button).
4. **What should it say?** Current placeholder thinking is "Schedule New" — but the copy
   should match whatever the actual next step is.
5. **What happens after they click?** Are there steps on Lindsay's side (confirmation,
   intake, prep) that the portal should set expectations about, or link to?

### One thing Russell needs to do in Webflow regardless of the answer

`ind-next-session-schedule` is a **container** that the script shows and hides. Setting an
`href` on a `<div>` does nothing. If the CTA is a button *inside* that block, the anchor needs
`data-field="ind-schedule-link"` on the `<a>` itself.

This is inert until added — `setLink` no-ops when nothing matches — so nothing breaks
meanwhile. See `portal-field-reference.md` §B.

### What unblocks this

Lindsay's answers to 1–5, then: set the link(s) in the dashboard (or leave the global one),
add the `data-field` in Webflow if needed, and finalise the tile.

---

## Q-02 — How does a member who buys a paid plan get past the portal gate?

**Waiting on:** Russell (Memberstack dashboard) · **Raised:** 2026-08-17 · **Blocks:**
selling any paid plan in the portal

Memberstack↔Stripe is wired and paid plans exist. But the portal gate tests for exactly two
**free** plan ids (`portal.js`), and the server's entitlement check reads the same two env
vars. A member who buys a *paid* plan holds a plan id neither has heard of — so they would
pay and still see the upsell.

**Recommended fix (dashboard, no code):** a Memberstack automation that also attaches the
matching free plan on paid-plan purchase. The free plan stays the entitlement the system
reads; the paid plan is what Stripe bills. Keeps one source of truth and avoids hardcoding
more plan ids into the browser.

**Alternative (code, not recommended):** teach both gates the paid plan ids — but that
duplicates plan ids into two JS files plus two env vars, which is the rotation problem the
audit already flags.

**Must be settled before anything goes on sale**, or buyers get nothing.

---

## Q-03 — Mobile: "upcoming session counts not displaying"

**Waiting on:** a look at the live mobile DOM · **Raised:** 2026-08-17 · **Blocks:** nothing
else

The sibling bug ("session links not displaying") had a confirmed code cause — `setLink` was
single-match while Webflow duplicates elements for mobile — and is **fixed** in `86e1aa4`.

The counts bug is **not** the same cause. Those fields already use `eachEl`
(`querySelectorAll`), so every duplicate is written. Something else is wrong: the mobile
markup may use different `data-field` values, or sit inside a container the script never
unhides.

**What unblocks this:** the rendered mobile DOM for the coaching panel (browser dev tools →
copy outerHTML of the counts area), or a screenshot plus the Webflow element structure.
Without it, any fix would be guesswork.

---

## Q-04 — What is "curated starter content" scoped by?

**Waiting on:** product decision · **Raised:** 2026-08-17 · **Blocks:** the membership page

The public library already exists — `content_items` where `client_id IS NULL AND cohort_id IS
NULL` — and is what search reads. Is the membership page simply *that*, filtered? Or a
hand-picked starter set, which would need a new column or table?

Worth knowing: `content_items.sequence_order` exists but is **never read or written anywhere**,
and `program_id` has been repurposed to hold an enrollment id. That pair looks like the
remains of an intended sequenced-program feature; reviving `sequence_order` is an option if
the answer is "a hand-picked ordered set".

---

## Q-07 — Droplet env vars this branch reads (deployed 2026-08-17)

**Waiting on:** Russell · **Blocks:** nothing — every one of these fails safe if absent

Production `.env` lives at `/root/library-search/.env` and is hand-maintained, so these
weren't added by the deploy. **Nothing is broken without them**; each just leaves a feature
inert. Edit the file, then `pm2 reload library-search`.

⚠️ `NEXT_PUBLIC_*` vars are baked in at **build** time, so changing one needs a rebuild
(`npm run build && pm2 reload library-search`), not just a reload.

### 1. `NEXT_PUBLIC_BOOKING_URL` — probably worth adding

```
NEXT_PUBLIC_BOOKING_URL=https://<lindsay's booking page>
```
The global fallback for the portal's "schedule a session" CTA, used when a client has no
per-client link of their own. **Without it** the API sends `calendar_url: null` and the
button keeps whatever href Webflow has hardcoded — which is exactly today's behaviour, so
nothing regresses.

Hold off if Q-01 (what the button should do) is still open — no point pointing it somewhere
before Lindsay confirms where.

### 2. `MEMBERSTACK_INDIVIDUAL_PLAN_ID` — check whether it's set

```
MEMBERSTACK_INDIVIDUAL_PLAN_ID=pln_individual-coaching-nkaa080g
```
**This is the switch that turns the server-side paywall on for the individual panel.**

- **Unset** → the API cannot evaluate individual entitlement, so it keeps access for
  everyone (fail-open). Gating is browser-only, as before this deploy.
- **Set** → the API enforces it. Any member whose Memberstack plan attach silently failed
  loses their coaching panel.

`MEMBERSTACK_COHORT_PLAN_ID` is confirmed set locally and behaves the same way for the
cohort panel.

**Before relying on it, open `/reconcile` on the live site.** It lists members missing a plan
they should have — precisely the people who would lose access. A clean report means the
paywall is safe to leave on.

### 3. `TZ` — set by the deploy, no action needed

`ecosystem.config.js` now pins `TZ: "America/New_York"` for PM2, so it applies on reload.
See Q-06 if that's the wrong zone.

---

## Q-06 — Confirm the coach's timezone (currently assumed America/New_York)

**Waiting on:** Russell/Lindsay · **Raised:** 2026-08-17 · **Blocks:** nothing, but a wrong
value silently mis-plots cohort schedules

Cohort schedules are now stepped in **local** time so a 7pm session stays 7pm across a DST
change (it previously drifted to 6pm — see the scheduler fix). That arithmetic only does
anything if the server has a zone **with** DST: on a UTC droplet the fix is inert and the
drift comes back for members in a DST zone.

So `ecosystem.config.js` now pins `TZ: "America/New_York"`. **That's an assumption**, made
because it's the most common US coaching timezone — not because it was confirmed.

**If Lindsay is elsewhere**, change that one value and `pm2 reload`. Existing rows are stored
as absolute timestamps and are unaffected; only future generations use it.

**Worth knowing:** this pins the zone the *schedule is plotted in*, which is the coach's, not
the member's. Members always see their own local time — the portal formats dates in the
browser's zone. A member in another country sees the correctly converted hour either way.

---

## Q-05 — Staging can't authenticate against the live backend

**Waiting on:** Russell · **Raised:** documented earlier in `portal-test-checklist.md:17-21`

One backend holds one `MEMBERSTACK_SECRET_KEY` (live), so test-mode tokens from
`sys-society-branding.webflow.io` **401**. Staging therefore cannot be used to verify portal
changes end-to-end; testing has to happen on the production domain, or that domain has to be
flipped to Live mode.

This is why `portal.js` changes in this branch were verified by syntax/ES5 checks and by
reading, rather than in a live staging portal.
