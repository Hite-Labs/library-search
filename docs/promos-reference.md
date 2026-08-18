# Promo blocks — field reference

Promo blocks are the upsell pieces that appear in the portal. They are managed
from the database, so offers can be added and retired without a code change or
a deploy.

**The table already exists.** It was created when the feature was built. There
is one Neon database shared by local development and the droplet, so there is
no separate production setup step.

To confirm it's there, run this in the Neon SQL Editor (neon.tech → your
project → SQL Editor):

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'promos';
```

Eleven rows means it exists.

---

## The rule that governs visibility

A promo shows to a member only when **all** of these are true:

1. `active` is true
2. today is on or after `starts_at` (or `starts_at` is empty)
3. `ends_at` has not yet passed (or `ends_at` is empty)
4. the member does **not** hold the plan named in `requires_missing_plan`
   (or `requires_missing_plan` is empty, meaning show to everyone)

Rule 4 is the important one: **you name the plan the member must be MISSING.**
A promo for the cohort sets `requires_missing_plan` to `cohort`, so cohort
members stop seeing it the moment they join.

### What that looks like in practice

| Member holds | Sees |
|---|---|
| cohort only | the coaching offer, plus any general notices |
| individual only | the cohort offer, plus any general notices |
| both plans | general notices only |
| no plans yet | everything |

That last row is the funnel: someone with an account but nothing purchased sees
every offer.

---

## The columns

| Column | Purpose |
|---|---|
| `title` | The headline on the promo card |
| `body` | Supporting text |
| `cta_label` | Button text, e.g. "Join the cohort" |
| `cta_url` | Where the button goes |
| `requires_missing_plan` | The plan key the member must NOT have. Empty = show to everyone. |
| `kind` | `buy` = an offer to purchase. `inclusion` = "included with your membership", styled differently. |
| `active` | Turn a promo off without deleting it |
| `sort_order` | Display order, lowest first |
| `starts_at` | Optional — don't show before this date |
| `ends_at` | Optional — don't show after this date |

`requires_missing_plan` has no database constraint on purpose. If it holds a
plan name that doesn't exist, the promo simply shows to everyone — the safe
direction for an upsell, and it means adding a new plan later doesn't require
a database change.

---

## Retiring an offer

Three ways, all without a deploy:

- **Pause it** — set `active` to false. Reversible.
- **Schedule its end** — set `ends_at`. It disappears on its own.
- **Delete it** — gone permanently.

Prefer `active` for anything you might bring back.

---

## Webflow side

The portal renders promos into a Webflow-authored template. The page needs:

- a container with the field name `promo-list`
- one card inside it as the template, containing `promo-title`, `promo-body`,
  `promo-cta-label`, and `promo-cta` (the link)
- optionally a second container `promo-inclusion-list` for the
  "included with your membership" style

The first card inside the container is the template — the script clones it once
per promo. If these elements are absent the script does nothing, so nothing
breaks while the Webflow work is pending.

Optional extras:

- `promo-empty` / `promo-inclusion-empty` — an element shown instead of the
  list when there are no promos to display. Leave these out if you'd rather
  show nothing at all.
- Each rendered card gets a `data-promo-kind` attribute set to `buy` or
  `inclusion`, so the two can be styled differently from a single template if
  you prefer that to two separate containers.

---

## Managing promos today

There is no dashboard page yet. Promos are created and edited through the API
(`/api/promos`), which requires a logged-in dashboard session. A management UI
is a separate piece of work — see `docs/open-questions.md`.
