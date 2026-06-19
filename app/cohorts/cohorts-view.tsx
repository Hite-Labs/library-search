'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

interface CohortRow {
  id: string;
  name: string;
  goal: string;
  status: 'active' | 'complete' | 'archived';
  total_sessions: number;
  current_session: number;
  member_count: number;
}

const STATUS_FILTERS = ['active', 'complete', 'archived', 'all'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  complete: 'bg-petal text-plum',
  archived: 'bg-petal/60 text-slate/50',
};

export function CohortsView() {
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === 'all' ? '' : `?status=${filter}`;
    const res = await fetch(`/api/cohorts${qs}`);
    const data = await res.json();
    setRows(data.cohorts ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-serif text-slate">Cohorts</h1>
            <p className="text-sm text-slate/60 mt-0.5">Group programs and their members</p>
          </div>
          <button type="button" onClick={() => setShowForm(true)}
            className="btn-spark">
            New cohort
          </button>
        </div>

        <div className="flex gap-1 mb-4">
          {STATUS_FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-label text-xs capitalize transition-colors ${
                filter === f ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal'
              }`}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gold/20 p-10 text-center text-sm text-slate/60">
            No {filter === 'all' ? '' : filter} cohorts yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link key={r.id} href={`/cohorts/${r.id}`}
                className="block bg-white rounded-xl border border-gold/20 p-4 hover:border-gold/50 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-slate truncate">{r.name}</span>
                      <span className={`font-label text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status] ?? ''}`}>{r.status}</span>
                    </div>
                    <p className="text-sm text-slate/60 truncate mt-0.5">{r.goal || 'No goal set'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-plum">Session {r.current_session} of {r.total_sessions}</p>
                    <p className="text-xs text-slate/60 mt-0.5">{r.member_count} member{r.member_count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showForm && <NewCohortModal onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function NewCohortModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [totalSessions, setTotalSessions] = useState('4');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/cohorts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, goal, totalSessions: parseInt(totalSessions, 10) || 4 }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to create cohort');
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-serif text-slate mb-4">New cohort</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-label text-xs text-slate mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              placeholder="e.g. Spring Confidence Cohort" />
          </div>
          <div>
            <label className="block font-label text-xs text-slate mb-1">Shared goal / theme</label>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} disabled={saving} rows={2}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none" />
          </div>
          <div>
            <label className="block font-label text-xs text-slate mb-1">Number of sessions</label>
            <input type="number" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} min="1" disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="btn-spark-outline flex-1 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving || !name}
              className="btn-spark flex-1 disabled:opacity-50">
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
