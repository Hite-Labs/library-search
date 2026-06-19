'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

interface Cohort {
  id: string; name: string; description: string; goal: string;
  total_sessions: number; current_session: number; status: 'active' | 'complete' | 'archived';
  zoom_url: string;
}
interface CohortSession { id: string; session_date: string | null; label: string; sort_order: number; }
interface Member { enrollment_id: string; client_id: string; client_name: string; client_email: string; goal: string; status: string; }
interface Content { id: string; title: string; public_url: string; media_type: string; }
interface DetailData { cohort: Cohort; sessions: CohortSession[]; roster: Member[]; content: Content[]; }

function fmtDateTime(d: string | null): string {
  if (!d) return 'No date set';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CohortDetailView({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [cohortId]);

  useEffect(() => { load(); }, [load]);

  async function patchCohort(body: Record<string, unknown>) {
    await fetch(`/api/cohorts/${cohortId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    load();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-petal/40">
        <Nav />
        <div className="py-16 flex justify-center">
          <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-petal/40">
        <Nav />
        <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-slate/60">Cohort not found.</div>
      </div>
    );
  }

  const { cohort } = data;

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/cohorts" className="text-sm text-slate/60 hover:text-slate">← All cohorts</Link>
        <h1 className="text-xl font-serif text-slate mt-2 mb-6">{cohort.name}</h1>

        {/* Progress + status */}
        <div className="bg-white rounded-2xl border border-gold/20 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-plum">
                Session {cohort.current_session} of{' '}
                <TotalEditor total={cohort.total_sessions} onSave={(n) => patchCohort({ totalSessions: n })} />
              </span>
              <div className="flex gap-1">
                <button onClick={() => patchCohort({ currentSession: Math.max(0, cohort.current_session - 1) })}
                  disabled={cohort.current_session <= 0}
                  className="w-7 h-7 rounded-lg border border-gold/30 text-plum hover:bg-petal disabled:opacity-40">−</button>
                <button onClick={() => patchCohort({ currentSession: cohort.current_session + 1 })}
                  className="w-7 h-7 rounded-lg border border-gold/30 text-plum hover:bg-petal">+</button>
              </div>
            </div>
            <div className="flex gap-1">
              {(['active', 'complete', 'archived'] as const).map((s) => (
                <button key={s} onClick={() => patchCohort({ status: s })} disabled={cohort.status === s}
                  className={`font-label text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                    cohort.status === s ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal border border-gold/20'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          <GoalEditor cohort={cohort} onSave={(goal) => patchCohort({ goal })} />
          <ZoomEditor cohort={cohort} onSave={(zoomUrl) => patchCohort({ zoomUrl })} />
        </div>

        <ScheduleSection cohortId={cohortId} sessions={data.sessions} onChange={load} />
        <SharedContentSection cohortId={cohortId} content={data.content} onChange={load} />
        <RosterSection cohortId={cohortId} roster={data.roster} onChange={load} />
      </div>
    </div>
  );
}

function GoalEditor({ cohort, onSave }: { cohort: Cohort; onSave: (g: string) => void }) {
  const [goal, setGoal] = useState(cohort.goal);
  const dirty = goal !== cohort.goal;
  return (
    <div>
      <label className="block font-label text-xs text-slate mb-1">Shared goal / theme</label>
      <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
        className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none" />
      {dirty && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(goal)} className="btn-spark text-xs px-3 py-1">Save</button>
          <button onClick={() => setGoal(cohort.goal)} className="btn-spark-outline text-xs px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

// Inline editable total-session count (the "of N" in the header).
function TotalEditor({ total, onSave }: { total: number; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(total));
  if (!editing) {
    return (
      <button onClick={() => { setVal(String(total)); setEditing(true); }} className="underline decoration-dotted hover:text-gold">
        {total}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" min="1" value={val} onChange={(e) => setVal(e.target.value)} autoFocus
        className="w-14 border border-slate/20 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
      <button onClick={() => { const n = parseInt(val, 10); if (n > 0) onSave(n); setEditing(false); }}
        className="font-label text-xs text-gold hover:text-plum">save</button>
      <button onClick={() => setEditing(false)} className="font-label text-xs text-slate/50">cancel</button>
    </span>
  );
}

// Shared Zoom link: editable field + copy button + open link.
function ZoomEditor({ cohort, onSave }: { cohort: Cohort; onSave: (url: string) => void }) {
  const [url, setUrl] = useState(cohort.zoom_url);
  const [copied, setCopied] = useState(false);
  const dirty = url !== cohort.zoom_url;
  return (
    <div>
      <label className="block font-label text-xs text-slate mb-1">Zoom link <span className="font-normal lowercase text-slate/50">(shared weekly)</span></label>
      <div className="flex gap-2">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://zoom.us/j/…"
          className="flex-1 border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        {cohort.zoom_url && !dirty && (
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(cohort.zoom_url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
            className="btn-spark-outline text-xs px-3 shrink-0">{copied ? 'Copied!' : 'Copy'}</button>
        )}
      </div>
      {dirty && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(url)} className="btn-spark text-xs px-3 py-1">Save</button>
          <button onClick={() => setUrl(cohort.zoom_url)} className="btn-spark-outline text-xs px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

function ScheduleSection({ cohortId, sessions, onChange }: { cohortId: string; sessions: CohortSession[]; onChange: () => void }) {
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/cohorts/${cohortId}/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, sessionDate: date ? new Date(date).toISOString() : null, sortOrder: sessions.length }),
    });
    setLabel(''); setDate(''); setSaving(false);
    onChange();
  }

  async function remove(sid: string) {
    await fetch(`/api/cohorts/${cohortId}/sessions/${sid}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <div className="bg-white rounded-2xl border border-gold/20 p-6 mt-4">
      <h2 className="font-label text-xs text-plum mb-3">Schedule</h2>
      {sessions.length > 0 && (
        <div className="space-y-2 mb-4">
          {sessions.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between border border-gold/20 rounded-lg p-2.5">
              <div>
                <span className="text-sm text-slate">{s.label || `Session ${i + 1}`}</span>
                <span className="text-xs text-slate/60 ml-2">{fmtDateTime(s.session_date)}</span>
              </div>
              <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block font-label text-xs text-slate/60 mb-1">Label</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Session 1: Intro" disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div>
          <label className="block font-label text-xs text-slate/60 mb-1">Date/time</label>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving}
            className="border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <button type="submit" disabled={saving || !label}
          className="btn-spark px-3 py-1.5 disabled:opacity-50">Add</button>
      </form>
    </div>
  );
}

function SharedContentSection({ cohortId, content, onChange }: { cohortId: string; content: Content[]; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function r2KeyFromUrl(u: string): string {
    try { return new URL(u).pathname.replace(/^\//, ''); } catch { return ''; }
  }

  async function attach(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const mediaType = /\.(mp4|mov|webm)$/i.test(url) ? 'video' : /\.pdf$/i.test(url) ? 'pdf' : 'audio';
    try {
      const res = await fetch(`/api/cohorts/${cohortId}/content`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, publicUrl: url, r2Key: r2KeyFromUrl(url), mediaType }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to attach');
      setTitle(''); setUrl(''); setShowAdd(false);
      onChange();
    } catch (err) { setError(String(err)); } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gold/20 p-6 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-label text-xs text-plum">Shared content <span className="font-normal text-slate/60">(all members see)</span></h2>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-slate/60 hover:text-slate underline underline-offset-2">
          {showAdd ? 'Cancel' : '+ Attach content'}
        </button>
      </div>
      {content.length > 0 && (
        <div className="space-y-2 mb-3">
          {content.map((c) => (
            <div key={c.id} className="flex items-center justify-between border border-gold/20 rounded-lg p-2.5">
              <span className="text-sm text-slate truncate">{c.title}</span>
              <a href={c.public_url} target="_blank" rel="noreferrer" className="text-xs text-slate/60 hover:text-slate shrink-0 ml-2">Open</a>
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <form onSubmit={attach} className="space-y-2 bg-petal/40 rounded-lg p-3">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="R2 file URL (https://…)" required disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={saving || !title || !url}
            className="btn-spark disabled:opacity-50">
            {saving ? 'Attaching…' : 'Attach'}
          </button>
        </form>
      )}
    </div>
  );
}

function RosterSection({ cohortId, roster, onChange }: { cohortId: string; roster: Member[]; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/cohorts/${cohortId}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, goal }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to add member');
      if (data.reusedClient) setNotice(`${name} already existed — linked their record to this cohort.`);
      setName(''); setEmail(''); setGoal('');
      if (!data.reusedClient) setShowAdd(false);
      onChange();
    } catch (err) { setError(String(err)); } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gold/20 p-6 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-label text-xs text-plum">Members ({roster.length})</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-slate/60 hover:text-slate underline underline-offset-2">
          {showAdd ? 'Cancel' : '+ Add member'}
        </button>
      </div>

      {roster.length > 0 && (
        <div className="space-y-2 mb-3">
          {roster.map((m) => (
            <Link key={m.enrollment_id} href={`/clients/${m.client_id}`}
              className="flex items-center justify-between border border-gold/20 rounded-lg p-3 hover:border-gold/50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm text-slate truncate">{m.client_name}</p>
                <p className="text-xs text-slate/60 truncate">{m.goal || m.client_email}</p>
              </div>
              <span className="text-xs text-slate/60 shrink-0 ml-2">View →</span>
            </Link>
          ))}
        </div>
      )}

      {showAdd && (
        <form onSubmit={add} className="space-y-2 bg-petal/40 rounded-lg p-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          <input type="text" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Individual goal (optional)" disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {notice && <p className="text-xs text-amber-700">{notice}</p>}
          <button type="submit" disabled={saving || !name || !email}
            className="btn-spark disabled:opacity-50">
            {saving ? 'Adding…' : 'Add member'}
          </button>
        </form>
      )}
    </div>
  );
}
