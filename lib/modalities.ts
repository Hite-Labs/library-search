/**
 * The content type list — what kind of technique a library item is.
 *
 * This lived as a hardcoded array in four separate files (the upload panel, the
 * library detail panel, the analyze route, and the Claude prompt), which meant adding
 * a type was four edits with nothing to catch a missed one. Adding Subliminal and
 * Somatic is what finally made that a problem worth fixing, so the list moved here and
 * those files now import it. Same pattern as lib/plan-keys.ts and lib/promo-pages.ts.
 *
 * The column is `content_items.modality`, plain text with no CHECK constraint. That is
 * deliberate and matches the rest of the schema: the registry lives in TypeScript, and
 * a CHECK in Postgres would have to be migrated in lockstep every time Lindsay wants a
 * new type. An unrecognised value is not dangerous here — it shows in the dashboard,
 * it is searchable, it just isn't offered in the dropdown.
 *
 * Which is why legacy rows keep working: library-detail.tsx prepends any value it finds
 * that isn't in this list, so an item tagged before a rename still displays and can
 * still be re-saved without silently changing.
 *
 * 'Other' stays last — it is the fallback Claude is told to use when the transcript
 * doesn't clearly indicate a technique, not a type Lindsay would normally pick.
 */
export const MODALITIES = [
  'Hypnosis',
  'EFT',
  'Tapping',
  'Meditation',
  'Subliminal',
  'Somatic',
  'Other',
] as const;

export type Modality = (typeof MODALITIES)[number];

/** Whether a stored value is one of the current types. Legacy rows may not be. */
export function isModality(value: string): value is Modality {
  return (MODALITIES as readonly string[]).includes(value);
}

/**
 * The list as Claude sees it in the analysis prompt. Built from MODALITIES rather than
 * written out again, so a new type reaches the AI tagger and the dropdowns together —
 * the drift this module exists to prevent.
 */
export const MODALITY_LIST = MODALITIES.join(', ');
