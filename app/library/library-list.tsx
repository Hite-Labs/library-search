'use client';

import { MediaBadge } from '@/components/MediaBadge';
import type { LibraryItem } from './library-view';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

interface LibraryListProps {
  items: LibraryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  filtered: boolean;
}

export function LibraryList({ items, selectedId, onSelect, loading, filtered }: LibraryListProps) {
  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gold/20 p-10 text-center text-sm text-slate/60">
        {filtered ? 'No items match those filters.' : 'Nothing in the library yet.'}
      </div>
    );
  }

  return (
    // The list scrolls on its own so the detail panel can stay put beside it.
    <div className="space-y-2 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:pr-1">
      {items.map((item) => {
        const selected = item.id === selectedId;
        const duration = fmtDuration(item.duration_seconds);
        return (
          // A button, not a Link — selecting an item doesn't navigate.
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`block w-full text-left bg-white rounded-xl border p-4 transition-all ${
              selected
                ? 'border-gold shadow-sm'
                : 'border-gold/20 hover:border-gold/50 hover:shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-serif text-slate truncate">{item.title}</span>
              <MediaBadge type={item.media_type} />
            </div>
            <p className="text-xs text-slate/60 mt-1 flex flex-wrap items-center gap-x-2">
              <span>{fmtDate(item.created_at)}</span>
              {duration && (
                <>
                  <span className="text-slate/30">|</span>
                  <span>{duration}</span>
                </>
              )}
              {item.transcript_length > 0 && (
                <>
                  <span className="text-slate/30">|</span>
                  <span>transcript</span>
                </>
              )}
            </p>
          </button>
        );
      })}
    </div>
  );
}
