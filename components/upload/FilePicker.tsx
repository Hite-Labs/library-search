'use client';

import { useRef } from 'react';

interface FilePickerProps {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

const ACCEPTED = '.mp4,.mp3,.m4a,.pdf';
const ACCEPTED_TYPES = ['video/mp4', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'application/pdf'];

export function FilePicker({ value, onChange, disabled }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && !ACCEPTED_TYPES.includes(file.type)) {
      alert('Unsupported file type. Please upload .mp4, .mp3, .m4a, or .pdf');
      return;
    }
    onChange(file);
  }

  return (
    <div
      className="border-2 border-dashed border-stone-300 rounded-lg p-6 text-center cursor-pointer hover:border-stone-400 transition-colors"
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      {value ? (
        <div className="text-sm text-stone-700">
          <p className="font-medium">{value.name}</p>
          <p className="text-stone-500">{(value.size / 1024 / 1024).toFixed(1)} MB</p>
          <button
            type="button"
            className="mt-2 text-xs text-red-500 hover:text-red-700"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="text-stone-500">
          <p className="text-sm font-medium">Click to select a file</p>
          <p className="text-xs mt-1">.mp4, .mp3, .m4a, .pdf</p>
        </div>
      )}
    </div>
  );
}
