'use client';

/**
 * Shared media-type badge styling. Lifted out of components/widget/ResultCard.tsx
 * so the admin library page and the public search widget label media types
 * identically — a divergence between the two would be invisible in review.
 *
 * 'pdf' displays as "Written", matching the Webflow collection's option name.
 */
export const MEDIA_BADGES: Record<string, { label: string; className: string }> = {
  audio: { label: 'Audio', className: 'tint-bg-plum-10 text-plum' },
  video: { label: 'Video', className: 'tint-bg-forest-10 text-forest' },
  pdf: { label: 'Written', className: 'tint-bg-gold-20 text-plum' },
};

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

export function MediaBadge({ type, className = '' }: { type: string; className?: string }) {
  const badge = MEDIA_BADGES[type] ?? { label: type, className: 'tint-bg-forest-10 text-forest' };
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className} ${className}`}
    >
      <MediaIcon type={type} />
      {badge.label}
    </span>
  );
}
