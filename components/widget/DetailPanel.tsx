'use client';

import { mediaBadge, MediaIcon } from '@/components/MediaBadge';
import { Player } from './Player';
import type { Result } from './types';

interface DetailPanelProps {
  /** null when nothing is selected — the panel renders nothing but keeps its slot. */
  item: Result | null;
  /** Passed to Player; fires once when this item starts playing. */
  onFirstPlay?: () => void;
}

/**
 * The selected item, shown above the results list.
 *
 * This replaces the per-item Webflow CMS page the result cards used to link out to.
 * Searching, choosing and playing all happen in one place now, which is the point of
 * search-first: you don't traverse categories, and you don't leave the page to listen.
 *
 * Always rendered, even with nothing selected, so its position among its siblings is
 * fixed — React reconciles by position, and a panel that appeared and disappeared would
 * shift the list's index and could unmount the playing <audio> element beneath it.
 */
export function DetailPanel({ item, onFirstPlay }: DetailPanelProps) {
  if (!item) return null;

  // The panel is a filled petal card, so the light palette is correct here.
  const badge = mediaBadge(item.mediaType);

  return (
    <div className="bg-petal border tint-border-gold-40 rounded-xl p-4 space-y-3 shadow-sm">
      {/*
        No title here, and no close button — both used to be, and both were duplicates.
        WidgetRoot renders the track title as the page's h1 the moment something is
        selected, so this card repeated it a few pixels lower; and "‹ Back to results"
        above it already closes the player, in words that say where it goes rather than a
        bare × that reads as "dismiss" and makes a poor tap target on a phone.
      */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
        >
          <MediaIcon type={item.mediaType} />
          {badge.label}
        </span>
        {item.modality && <span className="text-xs tint-forest-70">{item.modality}</span>}
      </div>

      {/*
        Keyed on the item id so switching items gives the transport a clean slate.
        The <audio> element inside is NOT keyed on src — see Player's header comment.
      */}
      <Player
        key={item.id}
        src={item.publicUrl}
        mediaType={item.mediaType}
        title={item.title}
        durationSeconds={item.durationSeconds}
        onFirstPlay={onFirstPlay}
      />

      {item.description && (
        <p className="text-xs tint-forest-70 leading-relaxed">{item.description}</p>
      )}

      {/*
        useCases and moodTags are not rendered. They stay in the payload and keep doing
        their real job — feeding search and the embeddings — but they are shelving
        vocabulary written for us, not for the member reading the card.
      */}
    </div>
  );
}
