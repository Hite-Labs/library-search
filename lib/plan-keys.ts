// The plan registry's data, with no dependencies.
//
// This is deliberately separate from lib/memberstack.ts. That module holds the Admin SDK
// and the secret key, so it is server-only — but the plan keys themselves are also needed
// by dashboard pages running in the browser (the promo form offers one option per plan).
// Importing memberstack.ts from a client component would pull @memberstack/admin and
// node:crypto into the browser bundle to read a two-element array.
//
// Add a plan here first; lib/memberstack.ts re-exports these, so every server-side
// consumer follows automatically.

/**
 * Every plan the portal knows about.
 *
 * `membership` is SYS Society, the audio membership. It was live in Memberstack and held
 * by real members long before it was listed here, which meant the portal didn't recognise
 * it: someone bought it, held a plan id nothing matched, and kept seeing the upsell asking
 * them to buy the thing they had just bought.
 */
export const PLAN_KEYS = ['individual', 'cohort', 'challenge', 'membership'] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

/** Which plans a member holds, keyed by plan. Replaces the old two-boolean shape. */
export type PlanFlags = Record<PlanKey, boolean>;

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value);
}
