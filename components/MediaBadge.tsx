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

export function MediaBadge({ type, className = '' }: { type: string; className?: string }) {
  const badge = MEDIA_BADGES[type] ?? { label: type, className: 'tint-bg-forest-10 text-forest' };
  return (
    <span
      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className} ${className}`}
    >
      {badge.label}
    </span>
  );
}
