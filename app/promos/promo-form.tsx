'use client';

import { useState } from 'react';
import { PLAN_KEYS } from '@/lib/plan-keys';
import type { Promo } from './promos-view';

/**
 * An <input type="datetime-local"> speaks "YYYY-MM-DDTHH:mm" with no timezone, while the
 * API takes a full ISO instant. These two convert between them through the browser's own
 * zone, so a coach typing "9am" schedules 9am where she is — not 9am UTC, which is the
 * mistake that makes a promo appear the previous evening.
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Mirrors PROMO_CODE in lib/schemas.ts. Checked here too so a typo is caught before a
// round-trip, with wording aimed at the person typing rather than at a developer.
const CODE_PATTERN = /^[a-z0-9-]+$/;

interface Props {
  /** The promo being edited, or null to create a new one. */
  promo: Promo | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

export function PromoForm({ promo, onCancel, onSaved }: Props) {
  const [code, setCode] = useState(promo?.code ?? '');
  const [hideIfHas, setHideIfHas] = useState(promo?.hide_if_has ?? '');
  const [note, setNote] = useState(promo?.note ?? '');
  const [followsChallengeWindow, setFollowsChallengeWindow] = useState(
    promo?.follows_challenge_window ?? false,
  );
  const [startsAt, setStartsAt] = useState(isoToLocalInput(promo?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(promo?.ends_at ?? null));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = promo !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the code from the Webflow block.');
      return;
    }
    if (!CODE_PATTERN.test(trimmed)) {
      setError('Codes can use lowercase letters, numbers and hyphens only — no spaces.');
      return;
    }

    const start = localInputToIso(startsAt);
    const end = localInputToIso(endsAt);
    if (start && end && new Date(end) <= new Date(start)) {
      setError('The end date has to be after the start date, or the promo never shows.');
      return;
    }

    setSaving(true);
    setError(null);

    // Create and update take different shapes. On update the clear* flags are the only way
    // to empty a nullable column, because omitting a field means "leave it alone".
    const payload = isEdit
      ? {
          code: trimmed,
          note: note.trim(),
          followsChallengeWindow,
          hideIfHas: hideIfHas || undefined,
          clearHideIfHas: !hideIfHas,
          startsAt: start ?? undefined,
          clearStartsAt: start === null,
          endsAt: end ?? undefined,
          clearEndsAt: end === null,
        }
      : {
          code: trimmed,
          note: note.trim(),
          followsChallengeWindow,
          hideIfHas: hideIfHas || null,
          startsAt: start,
          endsAt: end,
        };

    try {
      const res = await fetch(isEdit ? '/api/promos/' + promo.id : '/api/promos', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // 409 is a taken code — the server's message names it, and that is more useful
        // than a generic failure since the fix is to pick a different one.
        const data = await res.json().catch(() => null);
        throw new Error(
          res.status === 409 && data?.error
            ? data.error
            : 'Could not save. Check the fields and try again.',
        );
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  const inputClass =
    'w-full border border-slate/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold';
  const labelClass = 'block font-label text-xs text-slate/70 mb-1';

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate/15 rounded-xl p-5 mb-6">
      <h2 className="font-serif text-slate mb-4">{isEdit ? 'Edit promo rule' : 'New promo rule'}</h2>

      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="promo-code">
            Code
          </label>
          <input
            id="promo-code"
            className={inputClass + ' font-mono'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="cohort-upsell"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-slate/50 mt-1">
            Must match the block in Webflow exactly. On that element, set the attribute{' '}
            <code className="font-mono text-slate/70">data-promo</code> to this same code.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-audience">
            Who sees this
          </label>
          <select
            id="promo-audience"
            className={inputClass}
            value={hideIfHas}
            onChange={(e) => setHideIfHas(e.target.value)}
          >
            <option value="">Everyone</option>
            {PLAN_KEYS.map((k) => (
              <option key={k} value={k}>
                Everyone except {k} members
              </option>
            ))}
          </select>
          <p className="text-xs text-slate/50 mt-1">
            Hides the offer from people who already bought it.
          </p>
        </div>

        <div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={followsChallengeWindow}
              onChange={(e) => setFollowsChallengeWindow(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-label text-xs text-slate/70">
                Stop showing once the challenge closes to new joiners
              </span>
              <span className="block text-xs text-slate/50 mt-0.5">
                For challenge offers. Uses the active run&apos;s cutoff, so the offer
                retires itself instead of selling a run someone has mostly missed.
              </span>
            </span>
          </label>
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-note">
            Note
          </label>
          <input
            id="promo-note"
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Fall cohort launch"
          />
          <p className="text-xs text-slate/50 mt-1">
            Just for you — members never see this. It helps you tell rules apart at a glance.
          </p>
        </div>

        <details className="border-t border-slate/10 pt-3">
          <summary className="font-label text-xs text-slate/60 cursor-pointer hover:text-slate">
            Scheduling
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <label className={labelClass} htmlFor="promo-starts">
                Start showing
              </label>
              <input
                id="promo-starts"
                type="datetime-local"
                className={inputClass}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="promo-ends">
                Stop showing
              </label>
              <input
                id="promo-ends"
                type="datetime-local"
                className={inputClass}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate/50 mt-2">
            Leave both empty to show it until you pause it.
          </p>
        </details>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mt-5">
        <button
          type="submit"
          disabled={saving}
          className="bg-plum text-gold font-label text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="font-label text-sm text-slate/60 hover:text-slate px-3 py-2 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
