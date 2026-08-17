'use client';

import { ResultCard } from './ResultCard';

interface Result {
  id: string;
  title: string;
  description: string;
  mediaType: string;
  contentPageUrl: string | null;
  similarity: number;
}

interface ResultsListProps {
  /** null when the summary was skipped or failed — render cards alone, not an empty box. */
  response: string | null;
  results: Result[];
}

export function ResultsList({ response, results }: ResultsListProps) {
  return (
    <div className="space-y-4">
      {response && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
          <p className="text-sm text-stone-700 leading-relaxed">{response}</p>
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <ResultCard key={result.id} {...result} />
          ))}
        </div>
      )}
    </div>
  );
}
