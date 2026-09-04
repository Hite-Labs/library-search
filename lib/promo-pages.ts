// The promo page registry's data, with no dependencies.
//
// Separate from lib/db.ts and lib/schemas.ts for the same reason lib/plan-keys.ts is
// separate from lib/memberstack.ts: the dashboard's promo form runs in the browser and
// needs these names to draw its checkboxes. Importing them from a module that also pulls
// in the Neon client would ship the database driver to the browser to read a four-element
// array.
//
// Add a page here first; the dashboard form and the docs follow from it.

/**
 * Every page a promo can be placed on.
 *
 * These are the keys Lindsay puts on the per-page wrapper in Webflow —
 * `data-promo-page="membership"` — with every promo block for that page nested inside it.
 * A promo is then assigned to one or more of these from the dashboard, and portal.js
 * reveals a block only when its enclosing wrapper's key is in that list.
 */
export const PROMO_PAGES = ['membership', 'coaching', 'cohort', 'challenge'] as const;

export type PromoPage = (typeof PROMO_PAGES)[number];

/** Operator-facing names for the dashboard. Members never see these. */
export const PROMO_PAGE_LABELS: Record<PromoPage, string> = {
  membership: 'Membership / library',
  coaching: 'Coaching (1:1)',
  cohort: 'Cohort',
  challenge: '21-Day Challenge',
};

export function isPromoPage(value: unknown): value is PromoPage {
  return typeof value === 'string' && (PROMO_PAGES as readonly string[]).includes(value);
}
