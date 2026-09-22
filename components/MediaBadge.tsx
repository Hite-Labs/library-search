'use client';

/**
 * Shared badge styling. Lifted out of components/widget/ResultCard.tsx so the admin
 * library page and the public search widget label items identically — a divergence
 * between the two would be invisible in review.
 *
 * WHAT THE BADGE SAYS: the modality (Hypnosis, EFT, Somatic…), not the file format.
 *
 * Format used to be the badge, and it was the wrong thing to spend the loudest element
 * on the card on. "Audio" is already carried by the icon beside the title, so badging it
 * said the same thing twice; and a member scanning results is choosing a technique, not a
 * container. Whether something is hypnosis or somatic or tapping is the distinction worth
 * looking up — plenty of people don't know EFT by name — so that is what gets the pill.
 * Format keeps the icon alone, which is enough to tell a video from an audio at a glance.
 *
 * The format badge itself — the Audio/Video/Written pill and the per-format palette it
 * carried — is deleted rather than left unused. Keeping a working mediaBadge() around
 * would be an open invitation to put the format pill back on some future card, one
 * surface at a time, which is exactly how the two views drifted apart the first time.
 * Format now survives as MediaIcon alone, and there is no second way to render it.
 */

/**
 * Modality → badge colour, on a light card.
 *
 * Deliberately NOT one colour per modality. The list in lib/modalities.ts grows whenever
 * Lindsay adds a technique, and a per-value palette would mean picking a new brand-legal
 * colour every time, with nothing to catch a missing one — the exact drift that module
 * exists to prevent. One treatment for all of them keeps the pill a consistent object
 * whose JOB is to be read, not decoded: the word is the information.
 */
const MODALITY_BADGE = 'tint-bg-plum-10 text-plum';

/**
 * The badge on a DARK surface.
 *
 * The light palette above is dark ink meant for a light card — plum is #4e1a24. Put it on
 * the widget's dark host page and it reads as a smudge, which is what used to happen to
 * the Video badge: dark green on a 10%-dark-green tint, on dark, effectively invisible.
 *
 * So dark surfaces get cream text on a translucent cream tint. The word still carries the
 * meaning, which is what the badge is for — colour was never carrying it on its own.
 *
 * This lived inline in ResultCard, handling only its own outline variant. Everything else
 * that renders a badge on dark — the featured Getting Started card, the detail panel —
 * missed it, because a fix in one component cannot be found by the next one. Keeping it
 * here is what makes `onDark` a property of the badge rather than of whoever remembered.
 */
const MEDIA_BADGES_DARK = 'tint-bg-petal-15 text-petal';

/**
 * The badge for an item's modality, or null when it hasn't got one.
 *
 * Null is the whole point of the return type. Roughly speaking every item SHOULD carry a
 * modality — Claude assigns one at upload and falls back to 'Other' — but the column is
 * nullable text with no CHECK, so rows predating the tagger, or hand-edited to blank, do
 * exist. Those render no pill at all rather than falling back to a format badge: falling
 * back would quietly resurrect the thing we just removed, on exactly the rows nobody is
 * looking at. A bare card is honest about having nothing to say.
 *
 * An unrecognised legacy value is shown as-is, for the same reason library-detail.tsx
 * prepends it to the dropdown — it is real data, and hiding it would make it unfindable.
 */
export function modalityBadge(
  modality: string | null | undefined,
  onDark = false,
): { label: string; className: string } | null {
  const label = modality?.trim();
  if (!label) return null;
  return { label, className: onDark ? MEDIA_BADGES_DARK : MODALITY_BADGE };
}

/**
 * The same three Iconoir glyphs the member portal already uses — mic, video camera,
 * document — copied from MEDIA_ICONS in public/portal.js so a member sees one visual
 * language for media type across the portal and the library.
 *
 * One deliberate difference: these stroke in `currentColor` rather than the portal's
 * hardcoded white. The portal hardcodes because nothing there sets `color` on the wrapper,
 * and the icons rendered invisible when it didn't. Here they live inside a badge span that
 * already carries a text colour, so inheriting is both correct and what lets one icon work
 * on the widget's dark cards and the dashboard's light ones.
 *
 * Keyed by media_type, which the database constrains to exactly these three, so an
 * unrecognised value renders no icon rather than a broken one.
 */
const MEDIA_ICONS: Record<string, React.ReactNode> = {
  audio: (
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v4" />
      <path d="M8 23h8" />
    </>
  ),
  video: (
    <>
      <path d="M2 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z" />
      <path d="M15 11l6.4-3.2a.5.5 0 0 1 .7.4v7.6a.5.5 0 0 1-.7.4L15 13v-2z" />
    </>
  ),
  pdf: (
    <>
      <path d="M4 3a1 1 0 0 1 1-1h9l6 6v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3z" />
      <path d="M14 2v6h6" />
    </>
  ),
};

/** The glyph alone, for callers that want an icon without the pill around it. */
export function MediaIcon({ type, className = '' }: { type: string; className?: string }) {
  const paths = MEDIA_ICONS[type];
  if (!paths) return null;
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {paths}
    </svg>
  );
}

/**
 * What every card actually shows: the format as a bare icon, then the modality as the
 * badge. One component so the five places that render this pair — search results, the
 * shelf, the detail panel, and both admin library views — cannot drift apart again.
 *
 * The icon is muted rather than full-strength. It is a quiet marker of format sitting
 * beside the pill that carries the real label, and at equal weight the two competed.
 *
 * Renders nothing at all if there is neither an icon nor a modality, so a caller can
 * drop it into a flex row without guarding — it won't leave an empty gap behind.
 */
export function ItemTags({
  mediaType,
  modality,
  className = '',
  onDark = false,
}: {
  mediaType: string;
  modality: string | null | undefined;
  className?: string;
  /** True when this sits on the widget's dark page rather than a light card. */
  onDark?: boolean;
}) {
  const badge = modalityBadge(modality, onDark);
  const hasIcon = mediaType in MEDIA_ICONS;
  if (!badge && !hasIcon) return null;

  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 ${className}`}>
      <MediaIcon type={mediaType} className={onDark ? 'tint-petal-70' : 'tint-forest-70'} />
      {badge && (
        <span
          className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
    </span>
  );
}
