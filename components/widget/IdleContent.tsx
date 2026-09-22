'use client';

import { ItemTags } from '@/components/MediaBadge';
import { ResultCard } from './ResultCard';
import { gettingStartedToResult, type GettingStarted, type Result } from './types';

interface IdleContentProps {
  /** null while the fetch is in flight, or if it failed. */
  gettingStarted: GettingStarted | null;
  /** Most recently played first, capped at 3. Empty for a member who has played nothing. */
  recent: Result[];
  selectedId: string | null;
  onSelect: (item: Result) => void;
}

/**
 * What the widget shows before anyone has searched.
 *
 * This space used to be empty: the idle state rendered a search box and nothing else, so a
 * member arriving for the first time was asked to think of a query before they had seen a
 * single thing the library contains. Search-first is right for someone who knows what they
 * want; it is the wrong first impression for someone who doesn't.
 *
 * Two shelves, and only ever one at a time:
 *
 *   Recently played — once they have played anything, this REPLACES the curated shelf
 *                     entirely. Someone who has been here before is returning to something,
 *                     not being introduced.
 *   Begin here      — Lindsay's curated on-ramp, for everyone else.
 *
 * Rendering nothing is a legitimate third state: no curated items set, or the fetch failed.
 * The widget then looks exactly as it did before this component existed, which is a working
 * search box — a fetch failure must never cost a member the ability to search.
 */
export function IdleContent({ gettingStarted, recent, selectedId, onSelect }: IdleContentProps) {
  if (recent.length > 0) {
    return (
      <section className="space-y-3">
        <h2 className="font-label text-xs tint-petal-70">Pick up where you left off</h2>
        <div className="space-y-2">
          {recent.map((item) => (
            <ResultCard
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={onSelect}
              outline
            />
          ))}
        </div>
      </section>
    );
  }

  const primary = gettingStarted?.primary ?? null;
  const secondary = gettingStarted?.secondary ?? [];
  if (!primary && secondary.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-label text-xs tint-petal-70">Begin here</h2>

      {primary && <FeaturedCard item={gettingStartedToResult(primary)} onSelect={onSelect} selectedId={selectedId} />}

      {secondary.length > 0 && (
        <div className="space-y-2">
          {secondary.map((item) => {
            const result = gettingStartedToResult(item);
            return (
              <ResultCard
                key={result.id}
                item={result}
                selected={result.id === selectedId}
                onSelect={onSelect}
                outline
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The Primary item, given more room than the rest.
 *
 * Deliberately not just the first ResultCard in the list. The database allows exactly one
 * Primary — a partial unique index enforces it — and that constraint only earns its keep if
 * a member can see which item it picked out. Rendered as a filled petal card against the
 * outlined ones below, so "start with this" reads without a label saying so.
 */
function FeaturedCard({
  item,
  selectedId,
  onSelect,
}: {
  item: Result;
  selectedId: string | null;
  onSelect: (item: Result) => void;
}) {
  const selected = item.id === selectedId;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      className={`w-full text-left bg-petal border rounded-xl p-5 space-y-2 transition-colors focus:outline-none focus:ring-2 focus:ring-gold ${
        selected ? 'border-gold ring-1 tint-ring-gold-40' : 'tint-border-gold-40 hover:border-gold'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-forest">{item.title}</h3>
        {/* The featured card is a filled petal surface, so the light palette is correct here. */}
        <ItemTags mediaType={item.mediaType} modality={item.modality} />
      </div>
      {item.description && (
        <p className="text-xs leading-relaxed tint-forest-70">{item.description}</p>
      )}
      <div className="flex items-center justify-end pt-1">
        <span className="text-xs font-medium text-plum">
          {selected ? 'Playing above' : 'Start listening →'}
        </span>
      </div>
    </button>
  );
}
