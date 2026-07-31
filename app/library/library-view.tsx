'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Nav } from '@/components/Nav';
import { LibraryList } from './library-list';
import { LibraryDetail } from './library-detail';
import { UploadPanel } from './upload-panel';

export interface LibraryItem {
  id: string;
  webflow_item_id: string | null;
  title: string;
  description: string;
  media_type: 'audio' | 'video' | 'pdf';
  use_cases: string;
  modality: string | null;
  mood_tags: string;
  duration_seconds: number | null;
  r2_key: string;
  public_url: string;
  content_page_url: string | null;
  created_at: string;
  transcript_length: number;
}

export type LibraryItemDetail = LibraryItem & { transcript: string | null };

const MEDIA_FILTERS = ['all', 'audio', 'video', 'pdf'] as const;
type MediaFilter = typeof MEDIA_FILTERS[number];

// The API caps the list at 1000 rows. Hitting the cap means the page is no longer
// showing the whole library, which would quietly defeat its purpose — so we say so.
const LIST_CAP = 1000;

export function LibraryView() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LibraryItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');

  const loadItems = useCallback(async () => {
    const res = await fetch('/api/library');
    const data = await res.json();
    return (data.items ?? []) as LibraryItem[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadItems()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  // A new upload lands at the top of the list and opens in the detail panel, so
  // what you just added is immediately in front of you.
  const handleUploaded = useCallback(
    async (neonId: string) => {
      try {
        setItems(await loadItems());
        setSelectedId(neonId);
      } catch {
        // The item saved fine even if the refresh failed; leave the list alone.
      }
    },
    [loadItems],
  );

  // Load the selected item's full row (transcript included).
  //
  // The `cancelled` flag is load-bearing, not boilerplate: without it, clicking
  // through several items quickly lets a slow early response land last and show the
  // wrong item's data.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/library/${selectedId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setDetail(data.item ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Filtering is client-side over the single fetched array — the list is small
  // enough that a round-trip per keystroke would be strictly worse.
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (mediaFilter !== 'all' && i.media_type !== mediaFilter) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.mood_tags.toLowerCase().includes(q) ||
        i.use_cases.toLowerCase().includes(q)
      );
    });
  }, [items, query, mediaFilter]);

  // Patch the edited row in place rather than refetching the whole list — this is
  // what makes a save feel instant in the left column.
  const handleSaved = useCallback((updated: LibraryItemDetail) => {
    setDetail(updated);
    setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
  }, []);

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-4">
          <h1 className="text-xl font-serif text-slate">Library</h1>
          <p className="text-sm text-slate/60 mt-0.5">
            Add content and browse everything in the searchable library
            {!loading && items.length > 0 && ` — ${items.length} item${items.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {/* Upload sits at the top of the library it feeds: drop a file, review the
            auto-filled details, save, and the new item drops into the list below. */}
        <UploadPanel onUploaded={handleUploaded} />

        {items.length >= LIST_CAP && (
          <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Showing the {LIST_CAP} most recent items — the library has grown past what this
            page loads at once.
          </div>
        )}

        {/* Search + media-type filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, descriptions, tags…"
            className="w-full sm:max-w-sm border border-slate/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold"
          />
          <div className="flex gap-1">
            {MEDIA_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setMediaFilter(f)}
                className={`px-3 py-1.5 rounded-lg font-label text-xs capitalize transition-colors ${
                  mediaFilter === f ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal'
                }`}
              >
                {f === 'pdf' ? 'Written' : f}
              </button>
            ))}
          </div>
        </div>

        {/* minmax(0,…) on both tracks: without the zero min-width a long r2 key or
            URL expands its track and breaks the layout instead of truncating. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-6 items-start">
          {/* Below lg this is a single-pane push/pop — stacking would leave the
              detail far below the fold after a click. */}
          <div className={selectedId ? 'hidden lg:block' : 'block'}>
            <LibraryList
              items={visibleItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              loading={loading}
              filtered={query.trim() !== '' || mediaFilter !== 'all'}
            />
          </div>

          <div className={selectedId ? 'block' : 'hidden lg:block'}>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="lg:hidden mb-3 font-label text-xs text-plum hover:text-slate transition-colors"
            >
              ← Back to library
            </button>
            <div className="lg:sticky lg:top-8">
              <LibraryDetail
                key={detail?.id ?? 'none'}
                item={detail}
                loading={detailLoading}
                onSaved={handleSaved}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
