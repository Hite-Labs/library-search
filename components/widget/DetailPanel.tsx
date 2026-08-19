'use client';

import { MEDIA_BADGES } from '@/components/MediaBadge';
import { Player } from './Player';
import type { Result } from './types';

interface DetailPanelProps {
  /** null when nothing is selected — the panel renders nothing but keeps its slot. */
  item: Result | null;
  onClose: () => void;
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
export function DetailPanel({ item, onClose }: DetailPanelProps) {
  if (!item) return null;

  const badge =
    MEDIA_BADGES[item.mediaType] ?? { label: item.mediaType, className: 'bg-stone-100 text-stone-600' };

  // Stored as comma-separated text, not arrays. Split for display and drop the blanks
  // that a trailing comma or an empty column leaves behind.
  const tags = [item.useCases, item.moodTags]
    .flatMap((field) => (field ? field.split(',') : []))
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-stone-800 leading-snug">{item.title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
            {item.modality && <span className="text-xs text-stone-400">{item.modality}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-stone-400 hover:text-stone-700 text-lg leading-none px-1"
        >
          ×
        </button>
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
      />

      {item.description && (
        <p className="text-xs text-stone-500 leading-relaxed">{item.description}</p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.map((tag) => (
            <span key={tag} className="text-[11px] text-stone-500 bg-stone-100 rounded-full px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
