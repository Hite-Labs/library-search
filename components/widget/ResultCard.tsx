'use client';

import { MEDIA_BADGES } from '@/components/MediaBadge';
import type { Result } from './types';

interface ResultCardProps {
  item: Result;
  selected: boolean;
  onSelect: (item: Result) => void;
  /**
   * Outline treatment: a petal border over the transparent page instead of a petal fill.
   * Used for the "other results" beneath an open player, where a second set of filled
   * cards would carry the same visual weight as the thing currently playing.
   */
  outline?: boolean;
}

/**
 * One search result.
 *
 * The whole card is a button. It used to end in a "View resource →" anchor with
 * target="_parent", which navigated the host Webflow page away — losing the results,
 * and losing the member's token, which lives only in WidgetRoot's state and is pushed
 * in once when the iframe loads. It pointed at content_page_url, which is null for
 * every item in the library, so in practice it always rendered a greyed-out
 * "Link unavailable". Selecting now opens the item in place instead.
 */
export function ResultCard({ item, selected, onSelect, outline }: ResultCardProps) {
  // On an outline card the petal-tinted badges are illegible — they are built for a petal
  // surface, and here the surface is the dark host page showing through.
  const badge = outline
    ? { label: MEDIA_BADGES[item.mediaType]?.label ?? item.mediaType, className: 'tint-bg-petal-15 text-petal' }
    : MEDIA_BADGES[item.mediaType] ?? { label: item.mediaType, className: 'tint-bg-forest-10 text-forest' };

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      className={`w-full text-left border rounded-xl p-4 space-y-2 transition-colors focus:outline-none focus:ring-2 focus:ring-gold ${
        outline
          ? `bg-transparent ${selected ? 'border-gold' : 'tint-border-petal-40 hover:tint-border-gold-60'}`
          : `bg-petal ${
              selected ? 'border-gold ring-1 tint-ring-gold-40' : 'tint-border-forest-15 hover:tint-border-gold-60'
            }`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-sm font-semibold leading-snug ${outline ? 'text-petal' : 'text-forest'}`}>
          {item.title}
        </h3>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className={`text-xs leading-relaxed ${outline ? 'tint-petal-70' : 'tint-forest-70'}`}>
        {item.description}
      </p>
      <div className="flex items-center justify-between pt-1">
        <span className={`text-xs ${outline ? 'tint-petal-70' : 'tint-forest-70'}`}>
          {Math.round(item.similarity * 100)}% match
        </span>
        <span className={`text-xs font-medium ${outline ? 'text-petal' : 'text-plum'}`}>
          {selected ? 'Playing above' : 'Open →'}
        </span>
      </div>
    </button>
  );
}
