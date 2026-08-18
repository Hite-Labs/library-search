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

interface Props {
  /** The promo being edited, or null to create a new one. */
  promo: Promo | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

export function PromoForm({ promo, onCancel, onSaved }: Props) {
  const [title, setTitle] = useState(promo?.title ?? '');
  const [body, setBody] = useState(promo?.body ?? '');
  const [ctaLabel, setCtaLabel] = useState(promo?.cta_label ?? '');
  const [ctaUrl, setCtaUrl] = useState(promo?.cta_url ?? '');
  const [requiresMissingPlan, setRequiresMissingPlan] = useState(
    promo?.requires_missing_plan ?? '',
  );
  const [kind, setKind] = useState<'buy' | 'inclusion'>(promo?.kind ?? 'buy');
  const [sortOrder, setSortOrder] = useState(String(promo?.sort_order ?? 0));
  const [startsAt, setStartsAt] = useState(isoToLocalInput(promo?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(promo?.ends_at ?? null));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = promo !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give the promo a title.');
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

    // Create and update take different shapes. On update the clear* flags are the only
    // way to empty a nullable column, because omitting a field means "leave it alone".
    const common = {
      title: title.trim(),
      body: body.trim(),
      ctaLabel: ctaLabel.trim(),
      ctaUrl: ctaUrl.trim(),
      kind,
      sortOrder: Number(sortOrder) || 0,
    };

    const payload = isEdit
      ? {
          ...common,
          requiresMissingPlan: requiresMissingPlan || undefined,
          clearRequiresMissingPlan: !requiresMissingPlan,
          startsAt: start ?? undefined,
          clearStartsAt: start === null,
          endsAt: end ?? undefined,
          clearEndsAt: end === null,
        }
      : {
          ...common,
          requiresMissingPlan: requiresMissingPlan || null,
          startsAt: start,
          endsAt: end,
        };

    try {
      const res = await fetch(isEdit ? '/api/promos/' + promo.id : '/api/promos', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      await onSaved();
    } catch {
      setError('Could not save. Check the fields and try again.');
      setSaving(false);
    }
  }

  const inputClass =
    'w-full border border-slate/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold';
  const labelClass = 'block font-label text-xs text-slate/70 mb-1';

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-slate/15 rounded-xl p-5 mb-6"
    >
      <h2 className="font-serif text-slate mb-4">{isEdit ? 'Edit promo' : 'New promo'}</h2>

      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="promo-title">
            Title
          </label>
          <input
            id="promo-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Join the next cohort"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="promo-body">
            Body
          </label>
          <textarea
            id="promo-body"
            className={inputClass + ' resize-y min-h-[4.5rem]'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Six weeks of live group coaching, starting in September."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="promo-cta-label">
              Button text
            </label>
            <input
              id="promo-cta-label"
              className={inputClass}
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="Save my seat"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="promo-cta-url">
              Button link
            </label>
            <input
              id="promo-cta-url"
              className={inputClass}
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://showyourspark.com/cohort"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="promo-audience">
              Who sees this
            </label>
            <select
              id="promo-audience"
              className={inputClass}
              value={requiresMissingPlan}
              onChange={(e) => setRequiresMissingPlan(e.target.value)}
            >
              <option value="">Everyone</option>
              {PLAN_KEYS.map((k) => (
                <option key={k} value={k}>
                  Only members without {k}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate/50 mt-1">
              Hides the offer from people who already bought it.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="promo-kind">
              Style
            </label>
            <select
              id="promo-kind"
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as 'buy' | 'inclusion')}
            >
              <option value="buy">Offer to buy</option>
              <option value="inclusion">Included with their plan</option>
            </select>
            <p className="text-xs text-slate/50 mt-1">
              &quot;Included&quot; is for things they already have access to.
            </p>
          </div>
        </div>

        <details className="border-t border-slate/10 pt-3">
          <summary className="font-label text-xs text-slate/60 cursor-pointer hover:text-slate">
            Scheduling and order
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
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
            <div>
              <label className={labelClass} htmlFor="promo-sort">
                Order
              </label>
              <input
                id="promo-sort"
                type="number"
                className={inputClass}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate/50 mt-2">
            Leave the dates empty to show it until you pause it. Lower order numbers appear
            first.
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
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create promo'}
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
