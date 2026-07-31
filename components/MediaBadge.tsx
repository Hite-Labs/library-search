'use client';

/**
 * Shared media-type badge styling. Lifted out of components/widget/ResultCard.tsx
 * so the admin library page and the public search widget label media types
 * identically — a divergence between the two would be invisible in review.
 *
 * 'pdf' displays as "Written", matching the Webflow collection's option name.
 */
export const MEDIA_BADGES: Record<string, { label: string; className: string }> = {
  audio: { label: 'Audio', className: 'bg-violet-100 text-violet-700' },
  video: { label: 'Video', className: 'bg-blue-100 text-blue-700' },
  pdf: { label: 'Written', className: 'bg-amber-100 text-amber-700' },
};

export function MediaBadge({ type, className = '' }: { type: string; className?: string }) {
  const badge = MEDIA_BADGES[type] ?? { label: type, className: 'bg-stone-100 text-stone-600' };
  return (
    <span
      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className} ${className}`}
    >
      {badge.label}
    </span>
  );
}
