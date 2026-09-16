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

// The two no-match CTAs, now inline in prose rather than pill buttons.
//
// Gold at rest, not on hover. The widget's other inline links (WidgetRoot's "Search again")
// sit in petal and go gold on hover, but those are secondary controls beside something
// louder. Here the links ARE the call to action and have no button to defer to, so they
// carry the accent themselves. Measured 6.40:1 on plum and 6.18:1 on forest, both past the
// 4.5:1 AA floor this file's tint comments hold small text to.
//
// Underlined for the same reason: the iframe runs ~360px on a phone, where these replaced
// full-width tap targets, so colour alone is too thin an affordance — and colour alone
// would fail anyone who cannot distinguish it.
//
// text-gold, never `text-gold/nn`: opacity modifiers fail SILENTLY on this palette (see the
// warning in globals.css) and would render solid anyway.
//
// The hover goes to `text-petal`, a real Tailwind colour, NOT `hover:tint-petal-80`. The
// tint-* utilities are hand-written in globals.css, and Tailwind's hover: variant only wraps
// utilities it generated itself — so `hover:tint-petal-80` compiles to nothing at all and
// the hover silently never fires. Verified against the built stylesheet: `hover:text-gold`
// is present, `hover:tint-petal-80` is absent. Same trap the placeholder: rule at the bottom
// of globals.css had to be written out by hand for.
const CTA_LINK =
  'text-gold underline underline-offset-2 hover:text-petal transition-colors';

interface ResultsListProps {
  /** null when the summary was skipped or failed — render cards alone, not an empty box. */
  response: string | null;
  results: Result[];
  selectedId: string | null;
  onSelect: (item: Result) => void;
  /**
   * True once the member has picked something. Demotes this whole list: the summary is
   * hidden (it advises WHICH to pick, so it has done its job), the cards become outlines
   * rather than filled surfaces, and they sit under a "You may also like" heading.
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
        The open item is dropped from the list below its own player: "You may also like" means
        the alternatives, and repeating the selection there as a card reading "Playing
        above" is both redundant and a contradiction of the heading. Undemoted, the full
        list stays intact with the selection highlighted in place.
      */}
      {/*
        Nothing matched. This is the most valuable moment in the widget — a member has just
        described something the library does not have — so it ends in two actions rather
        than an apology.

        The hierarchy is still deliberate, now carried by order and wording rather than by
        button weight. Suggesting an idea is free and is what we want most of: it costs the
        member nothing and tells us what to record next, so it leads. Commissioning is the
        bigger ask and sits second.

        These were two full-width pill buttons until the copy was rewritten to put each CTA
        inside its own explaining sentence, which a pill cannot do without breaking the line.
        The trade is a smaller tap target in a ~360px iframe, so the links are underlined and
        gold-on-hover rather than colour-only — the affordance has to carry more here than it
        did when the whole row was tappable.
      */}
      {results.length === 0 && (
        <div className="space-y-3 text-sm tint-petal-80 leading-relaxed">
          <p>
            <a
              href={SUGGEST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={CTA_LINK}
            >
              Suggest an idea.
            </a>{' '}
            Tell us what you need and if it’s a fit, it becomes part of the collection.
          </p>
          <p>
            Get a custom audio, made just for you. We’ll create a custom hypnosis or
            subliminal audio built around exactly what you need.{' '}
            <a
              href={CUSTOM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={CTA_LINK}
            >
              Commission a Custom Audio here.
            </a>
          </p>
        </div>
      )}
      {visible.length > 0 && (
        <div className="space-y-3">
          {demoted && (
            <h2 className="font-serif text-lg tint-petal-80 pt-2">You may also like</h2>
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
