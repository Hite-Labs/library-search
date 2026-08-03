'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

interface ClientEnrollment {
  id: string;
  program_type: 'individual' | 'cohort';
  goal: string;
  status: 'active' | 'paused' | 'complete';
  total_sessions: number;
  sessions_done: number;
  cohort_id: string | null;
  cohort_name: string | null;
  last_session_at: string | null;
}

// One row per person. Someone in an individual pack AND a cohort is a single row
// with two program badges, not two rows that both link to the same client.
interface ClientRow {
  id: string;
  name: string;
  email: string;
  any_active: boolean;
  program_types: ('individual' | 'cohort')[];
  enrollments: ClientEnrollment[];
}

const STATUS_FILTERS = ['active', 'paused', 'complete', 'all'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  complete: 'bg-petal text-plum',
};

// Plan-type badge styling — visually distinct between the two program types (DS-06).
const TYPE_STYLES: Record<string, string> = {
  cohort: 'bg-plum text-gold',
  individual: 'border border-plum/30 text-plum',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ClientsView() {
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === 'all' ? '' : `?status=${filter}`;
    const res = await fetch(`/api/clients${qs}`);
    const data = await res.json();
    setRows(data.clients ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-serif text-slate">Clients</h1>
            <p className="text-sm text-slate/60 mt-0.5">Coaching clients and their program progress</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-spark"
          >
            New client
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 mb-2">
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
            <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gold/20 p-10 text-center text-sm text-slate/60">
            No {filter === 'all' ? '' : filter} clients yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const expanded = expandedId === r.id;
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gold/20 overflow-hidden">
                  {/* Person row: identity only. The programs live in the expansion, so
                      one human is one row no matter how many packs they're in. */}
                  <div className="flex items-center gap-3 p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left"
                      aria-expanded={expanded}
                    >
                      <span
                        className={`text-slate/40 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}
                        aria-hidden
                      >
                        ▶
                      </span>
                      {r.any_active && (
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Has an active program" />
                      )}
                      <span className="font-serif text-slate truncate">{r.name}</span>
                      {r.program_types.map((t) => (
                        <span
                          key={t}
                          className={`font-label text-xs px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_STYLES[t] ?? ''}`}
                        >
                          {t === 'cohort' ? 'Cohort' : 'Individual'}
                        </span>
                      ))}
                      <span className="text-xs text-slate/50 shrink-0">
                        {r.enrollments.length} program{r.enrollments.length === 1 ? '' : 's'}
                      </span>
                    </button>
                    <Link
                      href={`/clients/${r.id}`}
                      className="font-label text-xs text-plum hover:text-slate transition-colors shrink-0"
                    >
                      Open →
                    </Link>
                  </div>

                  {expanded && (
                    <div className="border-t border-gold/10 divide-y divide-gold/10">
                      {r.enrollments.map((e) => (
                        <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-petal/20">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-label text-xs px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_STYLES[e.program_type] ?? ''}`}>
                                {e.program_type === 'cohort' ? 'Cohort' : 'Individual'}
                              </span>
                              {e.cohort_name && (
                                <span className="text-xs text-slate/60 truncate">{e.cohort_name}</span>
                              )}
                              <span className={`font-label text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[e.status] ?? ''}`}>
                                {e.status}
                              </span>
                            </div>
                            <p className="text-sm text-slate/60 truncate mt-0.5">{e.goal || 'No goal set'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium text-plum">
                              {e.sessions_done} of {e.total_sessions}
                            </p>
                            <p className="text-xs text-slate/60 mt-0.5">last: {fmtDate(e.last_session_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <NewClientModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [goal, setGoal] = useState('');
  const [totalSessions, setTotalSessions] = useState('6');
  const [programType, setProgramType] = useState<'individual' | 'cohort' | 'both'>('individual');
  const [cohortId, setCohortId] = useState('');
  const [cohorts, setCohorts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needsCohort = programType === 'cohort' || programType === 'both';

  // Only fetch the cohort list when a cohort actually has to be picked.
  useEffect(() => {
    if (!needsCohort || cohorts.length > 0) return;
    fetch('/api/cohorts')
      .then((r) => r.json())
      .then((d) => setCohorts(d.cohorts ?? []))
      .catch(() => setCohorts([]));
  }, [needsCohort, cohorts.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          goal,
          totalSessions: parseInt(totalSessions, 10) || 6,
          programType,
          ...(needsCohort && cohortId ? { cohortId } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to create client');
      const msgs: string[] = [];
      if (data.reusedClient) {
        // Dedupe UX: the email matched an existing client — we added a new pack instead.
        msgs.push(`${firstName || data.client.name} already exists — added a new program (pack) for them.`);
      }
      if (data.alreadyMember) {
        msgs.push('They were already in that cohort, so no duplicate cohort place was created.');
      }
      // Provisioning is best-effort; if it failed the client was still saved. The new
      // member gets into the portal via the passwordless login link Lindsay shares (the
      // "Copy login link" button on the client page) — the app sends no email itself.
      if (data.provisionWarning) msgs.push(data.provisionWarning);
      // An existing member who gained a plan — worth saying, since it's what actually
      // unlocks the matching portal panel for them.
      if (data.plansAttached?.length) {
        msgs.push(`Added their ${data.plansAttached.join(' and ')} portal access in Memberstack.`);
      }

      if (msgs.length > 0) {
        // Keep the modal up briefly so Lindsay sees the note(s) before we refresh.
        setNotice(msgs.join(' '));
        setTimeout(onCreated, data.provisionWarning ? 2500 : 1500);
      } else {
        onCreated();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-serif text-slate mb-4">New client</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-label text-xs text-slate mb-1">First name</label>
              <input
                type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={saving}
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
            <div className="flex-1">
              <label className="block font-label text-xs text-slate mb-1">Last name</label>
              <input
                type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving}
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
          </div>
          <div>
            <label className="block font-label text-xs text-slate mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
          <div>
            <label className="block font-label text-xs text-slate mb-1">Goal</label>
            <textarea
              value={goal} onChange={(e) => setGoal(e.target.value)} disabled={saving} rows={2}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none"
              placeholder="What they're working toward this program"
            />
          </div>
          <div>
            <label className="block font-label text-xs text-slate mb-1">Program</label>
            <div className="flex gap-1">
              {(['individual', 'cohort', 'both'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProgramType(p)}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg font-label text-xs capitalize transition-colors ${
                    programType === p ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal border border-gold/20'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {needsCohort && (
            <div>
              <label className="block font-label text-xs text-slate mb-1">Cohort</label>
              <select
                value={cohortId} onChange={(e) => setCohortId(e.target.value)} disabled={saving}
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold"
              >
                <option value="">Select a cohort…</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Session count belongs to an individual pack; a cohort's progress is the
              cohort's, so this is meaningless for cohort-only clients. */}
          {programType !== 'cohort' && (
            <div>
              <label className="block font-label text-xs text-slate mb-1">Sessions in package</label>
              <input
                type="number" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)}
                min="1" disabled={saving}
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {notice && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{notice}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="btn-spark-outline flex-1 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !firstName || !email || (needsCohort && !cohortId)}
              className="btn-spark flex-1 disabled:opacity-50">
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
