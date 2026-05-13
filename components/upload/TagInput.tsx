'use client';

import { useState, KeyboardEvent } from 'react';

interface TagInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TagInput({ label, value, onChange, placeholder, disabled }: TagInputProps) {
  const [input, setInput] = useState('');

  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  function addTag(raw: string) {
    const newTags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const merged = [...new Set([...tags, ...newTags])];
    onChange(merged.join(', '));
    setInput('');
  }

  function removeTag(tag: string) {
    const updated = tags.filter((t) => t !== tag);
    onChange(updated.join(', '));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1">{label}</label>
      <div className="min-h-[42px] border border-stone-300 rounded-md p-2 flex flex-wrap gap-1 focus-within:ring-2 focus-within:ring-stone-400">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 text-xs px-2 py-1 rounded"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-stone-400 hover:text-stone-600"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          placeholder={tags.length === 0 ? (placeholder ?? 'Type and press Enter') : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
        />
      </div>
      <p className="text-xs text-stone-400 mt-1">Press Enter or comma to add a tag</p>
    </div>
  );
}
