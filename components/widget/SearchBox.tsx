'use client';

import { FormEvent } from 'react';
import { VoiceInput } from './VoiceInput';

interface SearchBoxProps {
  query: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function SearchBox({ query, onChange, onSubmit, disabled }: SearchBoxProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative flex items-start gap-2">
        <textarea
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="How are you feeling? What do you need right now?"
          disabled={disabled}
          rows={3}
          className="flex-1 border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (query.trim()) onSubmit();
            }
          }}
        />
        <div className="pt-2">
          <VoiceInput onTranscript={(t) => onChange(query ? `${query} ${t}` : t)} disabled={disabled} />
        </div>
      </div>
      <button
        type="submit"
        disabled={disabled || !query.trim()}
        className="w-full bg-stone-800 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-stone-700 disabled:opacity-40 transition-colors"
      >
        {disabled ? 'Finding your match…' : 'Find resources'}
      </button>
    </form>
  );
}
