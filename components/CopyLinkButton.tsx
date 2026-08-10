'use client';

import { useState } from 'react';

/**
 * Copy-to-clipboard button with a brief "Copied!" confirmation. Renders nothing when
 * `value` is empty, so callers can pass an unset env var straight through instead of
 * guarding at every call site.
 *
 * `variant` picks the two shapes already in use: `pill` is the outlined button used for
 * Zoom/calendar links, `text` is the quieter underlined link used under a client's email.
 */
export function CopyLinkButton({
  value,
  label,
  variant = 'pill',
  className = '',
}: {
  value: string;
  label: string;
  variant?: 'pill' | 'text';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const base =
    variant === 'pill'
      ? 'btn-spark-outline text-xs px-3 py-1.5 shrink-0'
      : 'text-xs text-plum/70 hover:text-plum underline underline-offset-2';

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked (insecure context / denied permission) — no-op */
        }
      }}
      className={`${base} ${className}`.trim()}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
