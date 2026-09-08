# SYS Membership — Promo Logic, Access Testing & QA Plan

*Rewritten 2026-09-08, correcting the 2026-09-04 draft against what is actually built and
deployed. Verified against production and the live database, not from memory.*

**What changed:** eight of the ten "blocking build items" were already finished — four of
them before the draft was written. This plan's job is now **verification**, not construction.
Three genuine blockers remain, none of them the ones the draft named. See Section 2.

---

## 1. What is actually true now

Visibility depends on three independent layers, all live:

1. **Which plans a person holds** — `individual`, `cohort`, `challenge`, `membership`, read
   from Memberstack per request.
2. **Ownership suppression** — a promo names one plan in `hide_if_has`; anyone holding it
   never sees that promo.
3. **Page placement** — a promo lists the pages it may appear on; the block only reveals
   inside a matching `data-promo-page` wrapper.

All three must pass. Plans are decided on the server, pages in the browser (only the browser
knows which page it is on).

### Two premises in the original draft were wrong

**"The window runs ~9 days from signup."** It does not. There is no per-member join record
anywhere in the system — deliberately, and documented as such. The cutoff counts from the
**challenge run's own `start_date`** and is shared by everyone. It is currently **10 days**,
not 9.

It also **only gates the sale**. Someone who joined on day 1 keeps their content after the
cutoff passes; withholding it would eject the whole group mid-run. So "sign-up should close"
is right; "the challenge should stop being available" is wrong.

**"There is no zero-purchase login."** There now is, by two routes: Lindsay can provision a
coaching client who has bought nothing, and search is public, so anyone can create an account
before buying. That person sees every promo and is the primary funnel — the single most
important untested case. It is **P0** below.

---

## 2. Blockers — B1 and B2 cleared, B3 open

Verified against the live database 2026-09-08. Only **B3** remains.

### B1. All four promos exist — CLEARED 2026-09-08

| code | hides from | pages | follows window |
|---|---|---|---|
| `audio-membership` | membership | membership, coaching, cohort, challenge | no |
| `ind-coaching` | individual | membership, coaching, cohort, challenge | no |
| `cohort-coaching` | cohort | coaching, membership | no |
| `challenge` | challenge | coaching, cohort | **yes** |

Every plan now has a promo targeting it. Simulated against the live rules, each persona
resolves correctly — P4 and P5 do not cross-suppress, and an account holding all four sees
nothing at all.

**Two placement gaps worth a deliberate yes/no**, since both look like omissions:

- **No promo appears on the challenge page except `ind-coaching` and `audio-membership`** —
  the cohort promo is not placed there. Intentional, or should a challenge member be offered
  the cohort?
- **`challenge` is not placed on the membership page.** A member browsing the library is
  never offered the challenge. Given the challenge is meant to be the front door, this may be
  the highest-value missing placement.

### B2. Challenge window wired — CLEARED 2026-09-08

`follows_challenge_window` is `true` on the `challenge` promo, so it retires itself when the
active run stops taking joiners. P2 is now testable — after 2026-09-13, or by shortening the
run's `join_cutoff_days` to force it early.

### B3. Decide which challenge run is real

Two rows exist:

- **ACTIVE** — "TEST 21 EFT Tapping into Confidence", started 2026-09-03, **day 5 of 21**,
  joining closes **2026-09-13**
- **DRAFT** — "Tap into Confidence 21-Day EFT Challenge", no start date, cutoff 2 days

Only one run can be active at a time. Testing P1 against the test run is fine, but the real
run needs dates before launch, and a draft run reveals nothing.

### Deferred: everything challenge-related (decided 2026-09-08)

The challenge depends on a Memberstack change that cannot be made from the app — the
membership→challenge bundle (Q-09) — so it is **parked, and the rest of the matrix runs
without it.** Nothing needs changing to allow this: `PORTAL_PRETEND_PLANS` sets any
combination, so the non-challenge personas are unaffected.

**Test now:** P0, P3, P4, P5, P6. Verified against the live rules — every one resolves
correctly on all three pages.

**Test later, once the bundle is settled:** P1, P2, and any membership+challenge combination.

⚠️ **One thing to fix first, whichever way the bundle goes.** The `challenge` promo has
`hide_if_has = membership`, not `challenge`. So today it is hidden from members — who do NOT
actually have challenge access — and shown to people who have already bought the challenge,
which is the one thing the field exists to prevent. Setting it to `challenge` is correct now
and stays correct after the bundle, with no second edit.

While the promo is mis-targeted, treat any challenge-promo result in P0/P3–P6 as unverified.

### Not blockers, but decide before launch

- **The membership→challenge bundle does not exist.** The challenge is meant to be included
  with SYS Society and is not. Confirmed the app *cannot* do it — Memberstack answers
  `plan-not-free`. Needs an automation on their side (Q-09).
- **Stripe comp/promo codes** — still to confirm, unchanged from the draft.

---

## 3. The draft's Section 2, item by item

| # | Item | State |
|---|---|---|
| 1 | Promo display | **Done.** Not a refactor — placement moved from Webflow to the dashboard (`pages` column + wrapper) |
| 2 | Promo suppression | **Was already built.** The bug was one unset env var, `MEMBERSTACK_MEMBERSHIP_PLAN_ID`. Fixed in prod |
| 3 | Challenge cutoff | **Was already built** (`lib/challenge-days.ts`, DST-safe). Unused until B2 |
| 4 | Library empty-search | **Done.** New copy plus two full-width CTAs |
| 5 | Non-member empty state | **Done.** `library-upsell` / `library-member-content` |
| 6 | Background audio | **Was already built.** MediaSession; the element is never torn down |
| 7 | Dashboard visibility | **Done.** `LEFT JOIN` fix — plan-only buyers appear under "All", flagged "No program" |
| 8 | Reconciliation | **Answered, not fixed.** No webhook, no cron — see §5 |
| 9 | Stripe promo codes | **Open — yours** |
| 10 | Challenge nav | **Was already built.** Driven by the plan, with four state blocks |

---

## 4. Testing method — one correction

The draft's primary method was toggling plans in Memberstack. **That does not work for the
paid plans.** `membership` and `challenge` can only be bought — `addFreePlan` refuses them —
and detaching one risks not getting it back without paying again.

Use instead:

- **`PORTAL_PRETEND_PLANS` (primary).** One env var on the droplet makes a single account
  appear to hold any subset of plans. Covers every persona below, writes nothing to
  Memberstack, and cannot affect other members.

  ```
  PORTAL_PRETEND_PLANS=mem_cmqpint2k027x0slbhoba2y8f:none
  PORTAL_PRETEND_PLANS=mem_cmqpint2k027x0slbhoba2y8f:cohort,challenge
  ```

  Then `pm2 restart library-search --update-env`. **Remove the line when finished** — left
  set, it silently restricts that account on the live site.

- **Memberstack toggling** — still valid for `individual` and `cohort` (both free), and the
  only way to exercise reconciliation for real.

- **Live Stripe checkout, once per product.** The challenge half is already done: a $1 test
  purchase on 2026-09-04 proved checkout → Memberstack → portal end to end.

⚠️ **The draft's "test reconciliation for free at every toggle" bonus does not survive this
change.** The override bypasses Memberstack entirely, so reconciliation needs its own pass.

---

## 5. Reconciliation — what is actually true

There is **no webhook and no cron**. Nothing pushes a Memberstack change into the dashboard.

- The **portal** is always current: it reads live plan state on every request.
- The **dashboard** is stale until somebody opens `/reconcile` and runs the check.

So plan changes *are* reflected where members see them, and *are not* in the admin view until
asked. That is a design gap rather than a bug, and deserves a decision rather than a test: is
on-demand good enough, or is a nightly job wanted?

Two sharp edges:

- `/reconcile` returns **503 unless all four plan-id env vars are set** — by design, since an
  unset id makes every member look unentitled.
- Its **attach button refuses paid plans** (422, with the reason). Detach still works. A paid
  plan can only be granted by purchase or a Memberstack automation.

---

## 6. Persona matrix

Programs: **21-Day Challenge**, **Membership**, **Cohort**, **1-on-1** — four independent
buckets. Cohort and 1-on-1 must not cross-suppress.

| ID | Appears to hold | Must NOT see | Must see | Also covers |
|---|---|---|---|---|
| **P0** | *nothing* | — | `portal-upsell` only — **no promos** | The funnel. See the nesting note below |
| **P1** | challenge, window open | challenge promo | membership, cohort, 1-on-1 | Challenge panel + day blocks; non-member empty state |
| **P2** | challenge, past cutoff | challenge promo **and** its offer | the others | **Needs B2.** Day content must still show |
| **P3** | membership | membership promo | coaching promos | Library member content; `library-upsell` hidden; empty-search CTAs |
| **P4** | cohort | cohort promo | 1-on-1 promo | Cohort panel, locked/unlocked sessions |
| **P5** | individual | 1-on-1 promo | cohort promo | Mirror of P4 — proves no cross-suppression |
| **P6** | membership + cohort | both of those | 1-on-1 promo | Combined suppression; two-tab header |
| **P7** | *lapsed* cancelled membership | — | membership promo again | New. Cancelled reads as not-held: panels close, upsell returns |

`P0` and `P7` are the cases the original matrix missed, and both are real paths.

### Promo wrappers are nested inside the panels (confirmed 2026-09-08)

On the coaching page the `data-promo-page` wrappers sit **inside** `portal-coaching` and
`portal-cohort`. So when a panel is hidden its promos go with it — a member who holds nothing
sees `portal-upsell` alone, and no offers at all.

That is the intended design, not a gap: the upsell block carries its own calls to action, and
a promo row underneath an empty panel would be a second, competing pitch. It does mean promo
visibility can only be tested by a persona that actually holds the panel the promo lives in,
so P0 verifies the upsell and nothing more.

An earlier draft of this plan asserted P0 should see every promo. It should not.

### Setting each persona

```
P0  :none              P1  :challenge          P2  :challenge (after 2026-09-13)
P3  :membership        P4  :cohort             P5  :individual
P6  :membership,cohort
```

P7 needs a genuinely cancelled plan, so the override cannot simulate it — use a real
cancellation in Memberstack, or accept it as untested.

---

## 6b. Run log

| Persona | Date | Result |
|---|---|---|
| **P0** — no plans | 2026-09-08 | **PASS**, after four fixes. Coaching page: no tabs, no panels, upsell shown. Membership page: upsell shown, member content and search both hidden. |
| **P3** — membership | 2026-09-08 | **PASS.** Upsell hidden, member content and search both revealed, search returns and plays, empty-search CTAs correct and linking properly. Promos suppress `audio-membership` and keep the others. |
| **P4** — cohort | 2026-09-08 | **PASS**, once the page was moved off the cached `portal.staging.js`. Cohort panel renders with its sessions, links and files; no tab header (one panel held); upsell hidden. Library page correctly withholds member content and search while showing the upsell. |

Bugs found and fixed during P0/P3, all of them in the reveal path rather than the rules:

1. The browser and server disagreed about plans; the server now sends its flags and wins.
2. `initTabs` opened the header and first panel on the browser's guess, before the fetch.
3. `embed.js` bailed on `if (!mount) return`, so the whole library gate never ran on a page
   without the search widget.
4. The token was read from `document.cookie`, which Memberstack does not populate — so the
   server was never asked and every decision fell back to the local read.
5. The search widget was revealed to anyone reaching the page, handing the paid library to
   every coaching, cohort and challenge customer.

### Cache gotcha — use portal.js, not portal.staging.js

During P4 the cohort panel did not appear, and switching the page from
`portal.staging.js` to `portal.js` fixed it immediately. Both files were verified identical
on the server apart from the price hunk, and both carried every fix — so the failure was a
**browser-cached copy** of the staging file, not a code difference. `Cache-Control:
max-age=0` on both means a hard refresh normally suffices, but the staging file had been
loaded across many reloads before the fixes landed.

`portal.staging.js` exists only to point the buy button at a $1 test price. That purchase is
done, so the member pages should load **`portal.js`** — the code that actually ships. If
staging is ever needed again, hard-refresh it deliberately and re-check.

## 7. Cross-cutting checks

- **Promo copy and links.** Can start now. ⚠️ Two buttons currently carry
  `data-field="sys-society-buy-button"` while labelled *"Book an Assessment Call"* and
  *"Apply for Full of Herself"* — both would trigger **SYS Society checkout**, taking money
  for the wrong product. Fix before any promo goes live.
- **`data-ms-price:add` vs `data-field`.** Two of four promo buttons use Memberstack's own
  attribute, which competes with the script's handler. Standardise on one.
- **The flash.** Every gated block needs the hidden class, and the class must actually carry
  `display:none` in Webflow — a class name with no rule behind it caused one false bug hunt.
- **Background audio.** Two devices, at least one iOS. Not account-dependent.
- **Empty promo row.** A wrapper whose promos are all suppressed stays closed — confirm there
  is no blank gap for P6.

---

## 8. Sequencing

1. **Now, in parallel:** promo copy/link QA, and fix the two wrong buy buttons (§7).
2. **B1–B3:** build the cohort and challenge promos, tick `follows_challenge_window`, settle
   which challenge run is live.
3. **Personas P0–P6** via `PORTAL_PRETEND_PLANS`. Remove the var afterwards.
4. **Reconciliation pass** — real Memberstack toggles on the two free plans, checking
   `/reconcile` before and after.
5. **Stripe:** membership checkout (the challenge is already proven).
6. **Anytime:** background audio on two devices.

P2 can only run after **2026-09-13**, when the active run's join window closes — or by
shortening `join_cutoff_days` on that run to force it early.

---

## 9. Open decisions

- The membership→challenge bundle: an automation in Memberstack, or grant challenge access in
  code to anyone holding membership? (Q-09)
- Reconciliation: is on-demand acceptable, or is a scheduled job wanted? (§5)
- What happens to challenge access when a membership lapses — keep it, or revoke mid-run?
- Which challenge run is real, and what are its dates? (B3)
