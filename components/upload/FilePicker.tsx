'use client';

import { useRef } from 'react';

interface FilePickerProps {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * What the library uploader takes. Matches the client and cohort uploaders, which have
 * accepted .mov and .wav since they were built — this picker was the one path that didn't,
 * which is how a QuickTime recording (what a Mac screen capture or a phone produces) hit a
 * dead end here while the same file uploaded fine on a client page.
 *
 * Extensions, not MIME types. The old check compared file.type against an allowlist, and
 * browsers are not consistent about what they report for .mov: 'video/quicktime' on some,
 * empty string on others (notably Windows, where the type comes from a registry lookup that
 * may simply be absent). An allowlist of MIME types therefore rejects valid files for
 * reasons the person uploading cannot see or fix. The extension is what the user chose and
 * what R2, AssemblyAI and the media element all key off downstream.
 */
const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mp3', '.wav', '.m4a', '.pdf'] as const;
const ACCEPTED = ACCEPTED_EXTENSIONS.join(',');

export function FilePicker({ value, onChange, disabled }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    const name = file?.name.toLowerCase() ?? '';
    if (file && !ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      alert(`Unsupported file type. Please upload one of: ${ACCEPTED_EXTENSIONS.join(', ')}`);
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
          <p className="text-xs mt-1">{ACCEPTED_EXTENSIONS.join(', ')}</p>
        </div>
      )}
    </div>
  );
}
