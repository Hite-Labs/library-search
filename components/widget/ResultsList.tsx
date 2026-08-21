'use client';

import { Fragment } from 'react';
import { ResultCard } from './ResultCard';
import type { Result } from './types';

/**
 * Render **bold** spans from the summary.
 *
 * Claude writes the summary as markdown and reliably bolds the titles it recommends,
 * but nothing here ever parsed it — so the asterisks shipped literally, and the one
 * word the answer was pointing at read as `**Camera Confidence**`. Pulling in a
 * markdown library for a single inline rule would be disproportionate; this handles
 * exactly the syntax the prompt produces and leaves anything else as plain text.
 *
 * Splits on the delimiter pair so an unmatched `**` simply stays visible rather than
 * swallowing the rest of the paragraph.
 */
function renderBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    // Odd indices are the captured groups, i.e. what sat between the asterisks.
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

interface ResultsListProps {
  /** null when the summary was skipped or failed — render cards alone, not an empty box. */
  response: string | null;
  results: Result[];
  selectedId: string | null;
  onSelect: (item: Result) => void;
  /**
   * True once the member has picked something. Demotes this whole list: the summary is
   * hidden (it advises WHICH to pick, so it has done its job), the cards become outlines
   * rather than filled surfaces, and they sit under an "Other results" heading.
   */
  demoted?: boolean;
}

export function ResultsList({ response, results, selectedId, onSelect, demoted }: ResultsListProps) {
  const visible = demoted ? results.filter((r) => r.id !== selectedId) : results;

  return (
    <div className="space-y-4">
      {/*
        Prose on the page itself, not on a petal card. It is a sentence of advice, not an
        object you can act on — giving it the same filled surface as a playable result made
        it compete with the things that are actually clickable.
      */}
      {response && !demoted && (
        <p className="text-sm tint-petal-80 leading-relaxed">{renderBold(response)}</p>
      )}
      {/*
        The open item is dropped from the list below its own player: "Other results" means
        the alternatives, and repeating the selection there as a card reading "Playing
        above" is both redundant and a contradiction of the heading. Undemoted, the full
        list stays intact with the selection highlighted in place.
      */}
      {visible.length > 0 && (
        <div className="space-y-3">
          {demoted && (
            <h2 className="font-serif text-lg tint-petal-80 pt-2">Other results</h2>
          )}
          {visible.map((result) => (
            <ResultCard
              key={result.id}
              item={result}
              selected={result.id === selectedId}
              onSelect={onSelect}
              outline={demoted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
