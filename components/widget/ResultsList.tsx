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

// Where a member goes when the library has nothing for them. Hardcoded rather than fetched:
// they are two fixed Webflow pages, and a round trip to learn URLs that never change would
// delay the one screen that most needs to be immediate.
const SUGGEST_URL = 'https://www.showyourspark.com/coaching/sys-audio-suggestion';
const CUSTOM_URL = 'https://www.showyourspark.com/coaching/sys-custom-hypnosis';

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
      {/*
        Nothing matched. This is the most valuable moment in the widget — a member has just
        described something the library does not have — so it ends in two actions rather
        than an apology.

        The hierarchy is deliberate. Suggesting an idea is free, takes a sentence, and is
        what we want most of: it costs the member nothing and tells us what to record next.
        So it leads, in the filled button. Commissioning a recording is $59 and a much bigger
        ask, so it sits second as an outline — present for the member who wants it now,
        without pricing the free option out of the frame.

        Both full width and stacked, at every size rather than just mobile: two pill buttons
        side by side in a ~360px iframe would wrap mid-word, and a full-width target is the
        easier tap on a phone, which is where these are read.
      */}
      {results.length === 0 && (
        <div className="space-y-2">
          <a
            href={SUGGEST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-spark w-full"
          >
            Submit your idea
          </a>
          <a
            href={CUSTOM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-spark-outline-light w-full"
          >
            Request a tailored recording — $59
          </a>
        </div>
      )}
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
