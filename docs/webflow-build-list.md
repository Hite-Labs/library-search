# What to build in Webflow

A plain-language checklist of everything the portal now supports that needs something built
on the Webflow side. Written for Lindsay's page, not for a developer.

The technical attribute-by-attribute reference is `docs/portal-field-reference.md`. This
document is the *build list*: what to make, and what it does when it's live.

---

## The one rule behind all of it

**Webflow holds the content. The database holds the visibility.**

Every block below is designed, written and styled entirely in Webflow — images, headings,
copy, buttons, links, all of it hardcoded there. The portal script never writes a word into
them. All it does is decide, per member, **which blocks are allowed to appear**.

That means Lindsay can rewrite any offer or any challenge day without a deploy and without
touching the dashboard.

It also means: **anything the script doesn't recognise stays hidden.** A typo in an attribute
costs you an impression — which you'll notice — rather than showing a cohort offer to
someone who already bought the cohort, which nobody would notice.

**Search is the one exception**, and it's section 1 below. It's a self-contained app that
sits in a frame rather than blocks you style — so there, you build the page *around* it.

---

## 1. The membership page & search — BUILT, ONE DIV TO ADD

Search works differently from everything else here, and it's worth knowing why before you
design around it.

The promos and challenge blocks are *your* Webflow elements that the script shows and hides.
Search isn't. It's a self-contained app dropped into the page inside a frame — the search
box, the results, the summary, the player and the empty state are all drawn by the app.

**So for search you build the page around it, not the thing itself.** Anything inside the
frame is a code change on my side; anything outside it is yours.

### 1a. What you build

Exactly one element. Give any div this ID and the search app appears there, sizing itself
to its own content:

| What | Name |
|---|---|
| The mount point (element **ID**) | `library-search-widget` |

An empty div is all it needs. Give it your page's normal max-width and let it size itself
vertically. Everything around it — heading, intro copy, whatever sits above and below — is
yours.

### 1b. What already happens, with nothing to build

| When | What the member sees |
|---|---|
| **Before searching** | A search box with a microphone button — they can speak the question instead of typing. |
| **While searching** | A spinner and "Looking through the library…" |
| **Good matches found** | A written summary first, then the result cards. Written fresh each time, not a canned line. |
| **Nothing matches well** | "I don't have something that's a perfect fit for that — reach out to Lindsay directly and she can point you in the right direction." No cards, no empty box. |
| **Too many searches too fast** | A plain "wait a moment" message, so one person can't run up the bill. |

On the no-results case specifically: a weak match is deliberately treated as *no* match, so
a member never gets the "no perfect fit" line sitting on top of three mediocre cards. It's
one or the other. That copy is fixed text, not written by the AI — if you want it to say
something else, or point at a form or booking link, that's a one-line change. **Tell me the
wording.**

### 1c. What happens when you click a result — NOW BUILT

Tapping a result **opens it in place**: a player and the item's details appear at the top,
and the rest of the results stay listed underneath, so moving between them is one tap.

The player is custom-built, not the default browser one: play/pause, a scrubber, skip
back/forward 15 seconds, and a speed control for audio.

**Audio keeps playing when the phone locks.** The title, artwork and controls appear on the
lock screen, so a member can start a sleep recording, put the phone down and let it run.
One caveat worth knowing: it plays *one* track — it won't automatically advance to a next
track while the screen is off, which recent iOS doesn't do reliably for anyone.

> **This replaces the Webflow CMS collection pages.** An earlier version of this document
> asked you to build a collection page template for library items. **You no longer need to** —
> searching, choosing and playing all happen in one place now. That's the whole point of
> search-first: you don't traverse categories, and you don't leave the page to listen.

### 1d. One thing that needs fixing before search is useful

**14 of the 15 items in the library have a broken search index.** They can't be matched by
any query — only one item, "Hidding to Shining", is currently findable.

Nothing to do with Webflow, and nothing you can fix; it's on my side and it's the next thing
I'd do. Worth knowing so an empty result doesn't read as your page being broken. Until it's
fixed, test search with wording close to that one item.

### 1e. Still open — your call

What should the membership page show *before* anyone searches? An empty box is honest but
doesn't suggest what to ask for. Options: a few example questions, a browsable list of
everything, or the newest few items. Say which and I'll tell you what it needs.

---

## 2. Promo blocks — READY TO BUILD

**What it is.** A promo is any block you want to show some members and not others. The
classic case: don't advertise the membership to people who already have it.

**In Webflow.** Build the block however you like, then add one custom attribute to the
outermost div:

| Attribute | Value |
|---|---|
| `data-promo` | the code, e.g. `cohort-upsell` |

Codes are lowercase letters, numbers and hyphens only. That's enforced by the dashboard, so
if it won't save, that's why.

**In the dashboard.** Go to **Promos → New promo** and create a rule with the same code.
The rule is where you say who *doesn't* see it ("hide if they already have: cohort"), and
when it runs (on/off, start date, end date).

**Things worth knowing:**

- A block with no matching dashboard rule **stays hidden**. Create the rule, or nothing shows.
- The code must match **exactly** — copy it from the dashboard, don't retype it.
- You can put the **same code on more than one block** (e.g. a desktop and a mobile version).
  All of them reveal together. This is supported on purpose.
- Everything inside the block is yours. Buttons and links are hardcoded by you.

**Suggested first blocks:**

- `cohort-upsell` — hide if they have: cohort
- `individual-upsell` — hide if they have: individual
- `challenge-offer` — the 21-day challenge pitch; tick **“Stop showing once the challenge closes to new joiners”** so it
  retires itself automatically once joining closes (see §3)

---

## 3. The 21-day challenge — READY TO BUILD, ONE THING BLOCKED

**What it is.** The challenge is the front door. Someone buys it (or gets it bundled with
the audio membership), creates a Memberstack account, and from that moment the account is
permanent. The *challenge content* has a window; the *account* never expires. Once they're
in, they can see everything else you offer.

### 3a. The panel

| What | Name |
|---|---|
| Panel container (element **ID**) | `portal-challenge` |
| Tab / nav link (custom attribute `data-field`) | `tab-challenge` |

These work the same way as `portal-cohort` / `tab-cohort` do today.

> 🔴 **This is the blocked piece.** The panel will not appear for anyone until the
> Memberstack challenge plan exists and its plan ID is put into the script. Build the
> Webflow side now — it will simply stay hidden — and it goes live the moment the plan ID
> lands. See §5.

### 3b. The 21 day blocks

Build **one block per day** — day 1 through day 21 — with the day's content written into it.
Add one custom attribute to each:

| Attribute | Value |
|---|---|
| `data-challenge-day` | `1`, `2`, `3` … `21` |

The script reveals only the days the member has unlocked and hides the rest. Days unlock at
the time you set in the dashboard (default 6:00am, US Eastern), one per day from the start
date.

- A member who joins on day 9 sees days 1–9 immediately. They're not made to wait.
- A locked day's content is never sent to the browser at all, so it can't be found early by
  anyone poking around.
- If you later run a challenge of a different length, just build that many blocks and set
  the total in the dashboard. Nothing is hardcoded to 21.

### 3c. The state blocks

The challenge panel should never go blank. Build **four blocks**, each with this custom
attribute, and exactly one will show at a time:

| `data-challenge-state` | Shows when | What to put in it |
|---|---|---|
| `running` | the run is live | the wrapper around your day blocks, the Telegram link, "day 4 of 21" |
| `not_started` | a run exists but hasn't begun | "Starts March 3 — here's how to prepare" |
| `finished` | the run's open window has closed | **the upsell moment.** "That run is over. Here's what's next." |
| `none` | no run is set up at all | a safe fallback — "Nothing scheduled right now" |

> The `finished` block is the most valuable one on the page. Someone has just spent 21 days
> with you and their account doesn't expire — this is where they find out what else they can
> buy. Don't leave it empty.

### 3d. Optional text fields inside the panel

Add `data-field="..."` to any text element to have the script fill it in:

| `data-field` | Fills with | Example |
|---|---|---|
| `challenge-name` | the run's name | "Spring 21-Day Challenge" |
| `challenge-current-day` | which day they're on | `4` |
| `challenge-total-days` | how long the run is | `21` |
| `challenge-starts-at` | the start date | "March 3, 2026" |
| `challenge-closes-at` | when access closes | "April 17, 2026" |

And one link — add `data-field="challenge-telegram-link"` to a link element and its href gets
set to the run's Telegram URL. If no URL is set in the dashboard the link is left alone, so
give it a sensible fallback href.

All of these are optional. Use the ones your layout wants.

### 3e. What "closes" means

Two separate settings in the dashboard, both counted in days from the start:

- **Open for** (default 45) — how long members keep access after the start date. This is
  always at least as long as the challenge itself, so a run can never close on someone
  mid-content.
- **Join cutoff** (default 10) — after this many days it's too late for *new* people to buy
  in. Joining on day 18 of 21 isn't worth their money or your community's time.

The join cutoff **never takes anything away from someone already in.** It only retires the
offer: any promo with **“Stop showing once the challenge closes to new joiners”** ticked disappears from the site once the
cutoff passes.

---

## 4. Where these blocks go

Nothing here changes the existing portal structure. Promo blocks can go anywhere on the page —
inside the cohort panel, inside the upsell panel, on their own. Put them where the offer
makes sense; the visibility rules travel with the block.

The challenge panel is a new sibling to the existing `portal-coaching` and `portal-cohort`
panels.

---

## 5. What's still open

### On my side — nothing for you to do

1. **Rebuild the search index for 14 of the 15 library items.** Until this is done they can't
   be found by any search. Next thing I'm doing.

2. **Fix why items stopped reaching the Webflow CMS** (only 1 of 15 got there). Lower priority
   now that item pages aren't needed — it matters again if you later want public,
   search-engine-visible pages for this content.

### On Memberstack — needs you

These three are the only things standing between the promo and challenge work above and it
all being live.

1. **Create the challenge plan in Memberstack.** Then send me the plan ID (`pln_…`) so it can
   replace the placeholder in the script, and set `MEMBERSTACK_CHALLENGE_PLAN_ID` on the
   server. Until this happens the challenge panel stays hidden for everyone.

2. **Automation: attach the challenge plan when someone buys the audio membership.** The
   challenge is meant to be included with it, and right now nothing connects the two.

3. **The paid-plan mismatch (the big one).** A member who buys a paid plan today ends up
   holding a plan ID the portal doesn't recognise — so they pay, and still see the upsell
   asking them to buy. This is a Memberstack dashboard fix, not code, and it's the
   highest-value open item on the list.

---

## 6. Quick reference

| Attribute | Where it goes | Values |
|---|---|---|
| id `library-search-widget` | an empty div on the membership page | element **ID**. The search app mounts here. |
| `data-promo="code"` | any promo block | must match a dashboard rule |
| `data-challenge-day="N"` | each day's block | `1` … `21` |
| `data-challenge-state="s"` | four state blocks | `running`, `not_started`, `finished`, `none` |
| `data-field="challenge-name"` | text element | filled by script |
| `data-field="challenge-current-day"` | text element | filled by script |
| `data-field="challenge-total-days"` | text element | filled by script |
| `data-field="challenge-starts-at"` | text element | filled by script |
| `data-field="challenge-closes-at"` | text element | filled by script |
| `data-field="challenge-telegram-link"` | link element | href set by script |
| `data-field="tab-challenge"` | the challenge tab/nav link | shown when entitled |
| id `portal-challenge` | the challenge panel | shown when entitled |
