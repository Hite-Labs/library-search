'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

export interface ChallengeRow {
  id: string;
  name: string;
  description: string;
  start_date: string | null;
  total_days: number;
  reveal_time: string;
  reveal_timezone: string;
  grace_days: number;
  telegram_url: string;
  status: 'draft' | 'active' | 'complete' | 'archived';
  created_at: string;
}

const STATUS_FILTERS = ['active', 'draft', 'complete', 'archived', 'all'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-slate/10 text-slate/70',
  complete: 'bg-plum/10 text-plum',
  archived: 'bg-slate/10 text-slate/50',
};

function fmtDate(iso: string | null): string {
  if (!iso) return 'No start date';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ChallengesView() {
  const [filter, setFilter] = useState<StatusFilter>('active');
  // Keyed by filter rather than a separate `loading` boolean: the spinner shows whenever
  // the rows on screen are not the ones this filter asked for, which is exactly the
  // condition, and it needs no setState inside the effect body.
  const [loaded, setLoaded] = useState<{ filter: StatusFilter; rows: ChallengeRow[] } | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);

  const fetchRows = useCallback(async () => {
    const qs = filter === 'all' ? '' : `?status=${filter}`;
    const res = await fetch(`/api/challenges${qs}`);
    const data = await res.json();
    return (data.challenges ?? []) as ChallengeRow[];
  }, [filter]);

  // The cancelled flag is not boilerplate: switching filters quickly lets a slow earlier
  // response land last and show the wrong list.
  useEffect(() => {
    let cancelled = false;
    fetchRows()
      .then((r) => {
        if (!cancelled) setLoaded({ filter, rows: r });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ filter, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRows, filter]);

  const loading = loaded === null || loaded.filter !== filter;
  const rows = loaded?.rows ?? [];

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-serif text-slate">Challenges</h1>
            <p className="text-sm text-slate/60 mt-0.5">
              21-day runs — the days are built in Webflow, this controls when they unlock
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="shrink-0 bg-plum text-gold font-label text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            New challenge
          </button>
        </div>

        <p className="text-sm text-slate/60 mb-5 max-w-2xl">
          Anyone holding the challenge plan in Memberstack can see the active run — whether
          they bought it, got it with their membership, or you added it to their account.
          There is no separate list of who is in.
        </p>

        <div className="flex gap-1 mb-4">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-label text-xs capitalize transition-colors ${
                filter === f ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-6 h-6 border-2 border-slate/20 border-t-plum rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate/20 rounded-xl bg-white/50">
            <p className="text-slate/70 text-sm">
              {filter === 'all' ? 'No challenges yet.' : `No ${filter} challenges.`}
            </p>
            <p className="text-slate/50 text-sm mt-1">
              Create one, set its start date, then make it active when you are ready.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/challenges/${r.id}`}
                className="block bg-white rounded-xl border border-gold/20 p-4 hover:border-gold/50 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-slate truncate">{r.name}</span>
                      <span
                        className={`font-label text-xs px-2 py-0.5 rounded-full font-medium ${
                          STATUS_STYLES[r.status] ?? ''
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate/60 truncate mt-0.5">
                      {r.description || 'No description'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-plum">{fmtDate(r.start_date)}</p>
                    <p className="text-xs text-slate/60 mt-0.5">
                      {r.total_days} days · reveals {r.reveal_time}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <NewChallengeModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            // Lands on the drafts list, where the new run is — and switching filter is
            // itself what refetches.
            setFilter('draft');
          }}
        />
      )}
    </div>
  );
}

/**
 * A new run starts as a draft, deliberately — the reveal settings decide when 21 days of
 * content appear, so making it live is a second, separate decision.
 */
function NewChallengeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalDays, setTotalDays] = useState('21');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the challenge a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          totalDays: Number(totalDays) || 21,
        }),
      });
      if (!res.ok) throw new Error('create failed');
      onCreated();
    } catch {
      setError('Could not create the challenge.');
      setSaving(false);
    }
  }

  const inputClass =
    'w-full border border-slate/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold';

  return (
    <div className="fixed inset-0 bg-slate/40 flex items-center justify-center p-4 z-50">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl p-6 w-full max-w-md border border-gold/20"
      >
        <h2 className="font-serif text-slate mb-4">New challenge</h2>

        <div className="space-y-4">
          <div>
            <label className="block font-label text-xs text-slate/70 mb-1" htmlFor="c-name">
              Name
            </label>
            <input
              id="c-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="21-Day Spark Challenge — Fall"
            />
          </div>
          <div>
            <label className="block font-label text-xs text-slate/70 mb-1" htmlFor="c-desc">
              Description
            </label>
            <input
              id="c-desc"
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block font-label text-xs text-slate/70 mb-1" htmlFor="c-days">
              Number of days
            </label>
            <input
              id="c-days"
              type="number"
              className={inputClass}
              value={totalDays}
              onChange={(e) => setTotalDays(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-slate/50 mt-3">
          It will be saved as a draft. Set the start date and reveal time next, then make it
          active.
        </p>

        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 mt-5">
          <button
            type="submit"
            disabled={saving}
            className="bg-plum text-gold font-label text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create'}
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
