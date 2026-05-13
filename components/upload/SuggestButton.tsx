'use client';

import { useState } from 'react';

interface SuggestButtonProps {
  title: string;
  description: string;
  onSuggest: (moodTags: string, useCases: string) => void;
  disabled?: boolean;
}

export function SuggestButton({ title, description, onSuggest, disabled }: SuggestButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest() {
    if (!title.trim() || !description.trim()) {
      setError('Fill in title and description first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Suggest failed');
      onSuggest(
        (data.moodTags as string[]).join(', '),
        (data.useCases as string[]).join(', '),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSuggest}
        disabled={disabled || loading}
        className="text-sm text-stone-500 hover:text-stone-700 underline underline-offset-2 disabled:opacity-50"
      >
        {loading ? 'Suggesting…' : '✦ Auto-suggest tags from title & description'}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
