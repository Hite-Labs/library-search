'use client';

import { FormEvent } from 'react';
import { VoiceInput } from './VoiceInput';

interface SearchBoxProps {
  query: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/**
 * The search input and its submit button.
 *
 * Both carry their own background on purpose. The widget's layout forces a transparent
 * page (see app/widget/layout.tsx) so the host Webflow section shows through, which
 * means nothing here can assume what colour sits behind it. An input with no background
 * of its own read as black over Lindsay's dark green section, and near-black `stone`
 * text sat on that same green — the two halves of the same wrong assumption.
 *
 * Colours come from the brand tokens in app/globals.css rather than Tailwind's stone
 * ramp, and the button reuses the `.btn-spark` class the rest of the app already uses
 * for primary actions instead of declaring its own plum-and-gold.
 */
export function SearchBox({ query, onChange, onSubmit, disabled }: SearchBoxProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* items-center, not items-start: the mic sits beside a single-line field now. */}
      <div className="relative flex items-center gap-2">
        {/*
          A single line, not a textarea. Searches here are a sentence at most, and the
          three-row box implied a paragraph was wanted. It also lets Enter submit the
          form natively — the old Enter/Shift+Enter keydown handler existed only to
          reproduce that inside a textarea, and is gone with it.
        */}
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="How are you feeling? What do you need right now?"
          disabled={disabled}
          className="flex-1 min-w-0 bg-petal border tint-border-forest-20 rounded-xl px-4 py-3 text-sm text-forest tint-placeholder-forest-50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold disabled:opacity-60"
        />
        <VoiceInput onTranscript={(t) => onChange(query ? `${query} ${t}` : t)} disabled={disabled} />
      </div>
      <button type="submit" disabled={disabled || !query.trim()} className="btn-spark w-full">
        {disabled ? 'Finding your match…' : 'Find resources'}
      </button>
    </form>
  );
}
