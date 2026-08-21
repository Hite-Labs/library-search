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
}

export function ResultsList({ response, results, selectedId, onSelect }: ResultsListProps) {
  return (
    <div className="space-y-4">
      {response && (
        <div className="bg-petal border tint-border-forest-15 rounded-xl p-4">
          <p className="text-sm text-forest leading-relaxed">{renderBold(response)}</p>
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <ResultCard
              key={result.id}
              item={result}
              selected={result.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
