# Promo blocks — how they work

A promo is an offer shown inside the member portal: join the cohort, book coaching,
take the challenge.

**The promo itself is built in Webflow.** Its heading, wording, image, layout and
button are all authored there and hardcoded — nothing about how it looks comes from
the database.

**The dashboard controls only who may see it.** One rule per block, matched by a code.

That split is the whole design. Lindsay changes what a promo says by editing Webflow.
Russell changes who sees it from the dashboard. Neither needs the other, and neither
needs a deploy.

---

## The two halves

### In Webflow

Put the promo block on the page and give its outer element one attribute:

```
data-promo = cohort-upsell
```

Everything inside is yours — any layout, any copy, any button pointing anywhere.

### In the dashboard

Go to **Promos** and add a rule with the same code:

| Field | Meaning |
|---|---|
| **Code** | Must match `data-promo` exactly. Lowercase letters, numbers and hyphens. |
| **Who sees this** | Which plan holders to hide it from. "Everyone" shows it to all. |
| **Note** | For you only. Members never see it. Helps tell rules apart. |
| **Start / stop showing** | Optional. Leave empty to run until paused. |

---

## The rule that governs visibility

A block appears only when **all** of these are true:

1. a rule exists for its code
2. that rule is not paused
3. today is on or after **Start showing** (or it is empty)
4. **Stop showing** has not yet passed (or it is empty)
5. the member does not hold the plan named in **Who sees this**

### A block with no rule stays hidden

This is deliberate and worth knowing before you build the Webflow side. If the
attribute says `cohot-upsell` and the dashboard says `cohort-upsell`, **nobody sees
the block.**

The alternative would be to show anything unrecognised — but then the same typo would
advertise the cohort to people who already paid for it. A promo that fails to appear
is a problem you notice. One that appears to the wrong people is not.

### What "Who sees this" does

You name the plan the member must **not** have. A cohort offer set to "Everyone except
cohort members" disappears the moment someone joins.

| Member holds | Sees a rule set to "except cohort" |
|---|---|
| cohort | hidden |
| individual | shown |
| both plans | hidden |
| no plans yet | shown |

That last row is the funnel: someone with an account but no purchase sees every offer.

---

## Retiring an offer

Three ways, none needing a deploy or a Webflow edit:

- **Pause** — the block stops showing. Reversible; use this by default.
- **Stop showing** — set a date and it retires itself.
- **Delete** — removes the rule permanently. The Webflow block stays on the page but,
  having no rule, no longer shows to anyone.

---

## Adding a second promo

Add another block in Webflow with a different code, then a second rule. There is no
limit, and no ordering to manage — they appear in the order they sit on the page.

For an "included with your membership" style block, that's just a second block with
its own code and its own look, targeted at whoever should see it.

---

## Checking your work

Open the Promos page. Each rule shows its own status:

- **Showing now** — live
- **Paused** — switched off
- **Starts Sep 1** — scheduled, not yet live
- **Ended Aug 3** — its window has passed

If a rule reads "Showing now" and the block still doesn't appear in the portal, the
code and the `data-promo` attribute don't match.

An audience shown in **amber** means the plan name isn't one the system knows, so the
rule isn't restricting anyone — the block is showing to everyone including people who
already bought it.

---

## For developers

- Rule storage and the `code` unique constraint: `db/schema.sql` (promos v2 block)
- Which codes a member qualifies for: `visiblePromoCodes` in `app/api/portal/route.ts`
- Reveal/hide in the browser: `renderPromos` in `public/portal.js`
- CRUD: `app/api/promos/`, dashboard at `app/promos/`

The API returns `promo_codes: string[]` — codes only. The rule behind them never
reaches the browser, and the reveal decision stays server-side because `portal.js` and
the server deliberately disagree about Memberstack plan detection (see the comment in
`gateAndLoad`).
