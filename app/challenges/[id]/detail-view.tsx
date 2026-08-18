'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import type { ChallengeRow } from '../challenges-view';

interface DayRow {
  day: number;
  unlocks_at: string | null;
  unlocked: boolean;
}

interface DetailData {
  challenge: ChallengeRow;
  days: DayRow[];
  access: {
    unlocked: number[];
    current_day: number | null;
    access_ends_at: string | null;
    started: boolean;
    ended: boolean;
  };
}

/** An ISO instant shown in the challenge's own reveal zone, which is the only zone that
 *  matters here — "day 4 unlocks at 6am" means 6am there, not wherever the operator is. */
function fmtInZone(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ChallengeDetailView({ challengeId }: { challengeId: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/challenges/${challengeId}`);
    if (!res.ok) throw new Error('load failed');
    return (await res.json()) as DetailData;
  }, [challengeId]);

  // Refetch-after-mutate, so this runs again on every save. `reloads` is the trigger:
  // bumping it re-runs the effect, which keeps the fetch in one place rather than
  // duplicating it into each mutation handler.
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchDetail()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load that challenge.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchDetail, reloads]);

  const load = useCallback(() => setReloads((n) => n + 1), []);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setError(null);
      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.details ? 'Check the values and try again.' : 'Could not save.');
        return false;
      }
      await load();
      return true;
    },
    [challengeId, load],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-petal/40">
        <Nav />
        <div className="py-24 flex justify-center">
          <div className="w-6 h-6 border-2 border-slate/20 border-t-plum rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-petal/40">
        <Nav />
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <p className="text-slate/70">{error ?? 'Challenge not found.'}</p>
          <Link href="/challenges" className="font-label text-sm text-plum mt-3 inline-block">
            ← Back to challenges
          </Link>
        </div>
      </div>
    );
  }

  const c = data.challenge;

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/challenges"
          className="font-label text-xs text-plum hover:text-slate transition-colors"
        >
          ← Challenges
        </Link>

        <div className="mt-3 mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-serif text-slate">{c.name}</h1>
            <p className="text-sm text-slate/60 mt-0.5">
              {c.description || 'No description'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-label text-xs text-plum hover:text-slate px-2 py-1 transition-colors"
            >
              Edit
            </button>
            <StatusControl status={c.status} onChange={(status) => patch({ status })} />
          </div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {c.status !== 'active' && (
          <div className="mb-4 text-sm text-slate/70 bg-white border border-slate/15 rounded-lg px-3 py-2">
            This run is <strong>{c.status}</strong>, so no member can see it. Only an active
            challenge appears in the portal.
          </div>
        )}

        {!c.start_date && (
          <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No start date set — nothing will unlock until there is one.
          </div>
        )}

        <StatusSummary data={data} />

        {editing && (
          <EditChallengeModal
            challenge={c}
            onClose={() => setEditing(false)}
            onSave={async (body) => {
              const ok = await patch(body);
              if (ok) setEditing(false);
            }}
          />
        )}

        <h2 className="font-serif text-slate mt-8 mb-2">Unlock schedule</h2>
        <p className="text-sm text-slate/60 mb-3">
          Times shown in {c.reveal_timezone.replace(/_/g, ' ')}, the challenge&apos;s own
          timezone. Build a block in Webflow for each day with the attribute{' '}
          <code className="font-mono text-slate/70">data-challenge-day</code> set to its
          number.
        </p>

        <div className="bg-white border border-slate/15 rounded-xl overflow-hidden">
          {data.days.map((d) => (
            <div
              key={d.day}
              className={`flex items-center justify-between gap-4 px-4 py-2 border-b border-slate/10 last:border-0 ${
                d.unlocked ? '' : 'bg-white/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                    d.unlocked ? 'bg-emerald-500' : 'bg-slate/25'
                  }`}
                  aria-hidden
                />
                <span
                  className={`font-mono text-sm ${d.unlocked ? 'text-slate' : 'text-slate/50'}`}
                >
                  Day {d.day}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${d.unlocked ? 'text-slate/70' : 'text-slate/45'}`}>
                  {fmtInZone(d.unlocks_at, c.reveal_timezone)}
                </span>
                <span
                  className={`font-label text-xs w-16 text-right ${
                    d.unlocked ? 'text-emerald-700' : 'text-slate/40'
                  }`}
                >
                  {d.unlocked ? 'Unlocked' : 'Locked'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusSummary({ data }: { data: DetailData }) {
  const { challenge: c, access } = data;
  const tz = c.reveal_timezone;

  const items: Array<[string, string]> = [
    ['Days unlocked', `${access.unlocked.length} of ${c.total_days}`],
    ['Current day', access.current_day == null ? 'Not started' : String(access.current_day)],
    ['Reveals at', `${c.reveal_time} ${tz.replace(/_/g, ' ')}`],
    [
      'Access ends',
      access.access_ends_at ? fmtInZone(access.access_ends_at, tz) : '—',
    ],
    ['Grace period', c.grace_days === 0 ? 'None' : `${c.grace_days} days`],
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="bg-white border border-slate/15 rounded-lg px-3 py-2">
          <p className="font-label text-xs text-slate/50">{label}</p>
          <p className="text-sm text-slate mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Status is the live/not-live switch, so it gets a confirm on the way to 'active' — that
 * is the moment 21 days of content become visible to every plan holder.
 */
function StatusControl({
  status,
  onChange,
}: {
  status: string;
  onChange: (status: string) => void;
}) {
  return (
    <select
      value={status}
      onChange={(e) => {
        const next = e.target.value;
        if (next === 'active' && !confirm('Make this challenge live for everyone holding the challenge plan?')) {
          return;
        }
        onChange(next);
      }}
      className="border border-slate/20 rounded-lg px-2 py-1 text-xs font-label bg-white focus:outline-none focus:ring-2 focus:ring-gold"
    >
      <option value="draft">Draft</option>
      <option value="active">Active</option>
      <option value="complete">Complete</option>
      <option value="archived">Archived</option>
    </select>
  );
}

function EditChallengeModal({
  challenge,
  onClose,
  onSave,
}: {
  challenge: ChallengeRow;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void | Promise<void>;
}) {
  const [name, setName] = useState(challenge.name);
  const [description, setDescription] = useState(challenge.description);
  const [startDate, setStartDate] = useState(toLocalInput(challenge.start_date));
  const [totalDays, setTotalDays] = useState(String(challenge.total_days));
  const [revealTime, setRevealTime] = useState(challenge.reveal_time);
  const [revealTimezone, setRevealTimezone] = useState(challenge.reveal_timezone);
  const [graceDays, setGraceDays] = useState(String(challenge.grace_days));
  const [telegramUrl, setTelegramUrl] = useState(challenge.telegram_url);
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full border border-slate/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold';
  const labelClass = 'block font-label text-xs text-slate/70 mb-1';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      name: name.trim(),
      description: description.trim(),
      startDate: startDate ? new Date(startDate).toISOString() : null,
      totalDays: Number(totalDays) || 21,
      revealTime,
      revealTimezone,
      graceDays: Number(graceDays) || 0,
      telegramUrl: telegramUrl.trim(),
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-slate/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl p-6 w-full max-w-lg border border-gold/20 my-8"
      >
        <h2 className="font-serif text-slate mb-4">Edit challenge</h2>

        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="e-name">
              Name
            </label>
            <input id="e-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className={labelClass} htmlFor="e-desc">
              Description
            </label>
            <input
              id="e-desc"
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="e-start">
              Day 1 date
            </label>
            <input
              id="e-start"
              type="datetime-local"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-slate/50 mt-1">
              Only the date matters — the time of day comes from the reveal time below.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="e-time">
                Reveal time
              </label>
              <input
                id="e-time"
                type="time"
                className={inputClass}
                value={revealTime}
                onChange={(e) => setRevealTime(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="e-tz">
                Timezone
              </label>
              <input
                id="e-tz"
                className={inputClass}
                value={revealTimezone}
                onChange={(e) => setRevealTimezone(e.target.value)}
                placeholder="America/New_York"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="e-days">
                Number of days
              </label>
              <input
                id="e-days"
                type="number"
                className={inputClass}
                value={totalDays}
                onChange={(e) => setTotalDays(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="e-grace">
                Grace days
              </label>
              <input
                id="e-grace"
                type="number"
                className={inputClass}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
              />
              <p className="text-xs text-slate/50 mt-1">Extra days to catch up after the last one.</p>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="e-tg">
              Telegram link
            </label>
            <input
              id="e-tg"
              className={inputClass}
              value={telegramUrl}
              onChange={(e) => setTelegramUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button
            type="submit"
            disabled={saving}
            className="bg-plum text-gold font-label text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="font-label text-sm text-slate/60 hover:text-slate px-3 py-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
