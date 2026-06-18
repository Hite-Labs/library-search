'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

interface Enrollment {
  id: string;
  program_type: string;
  goal: string;
  status: 'active' | 'paused' | 'complete';
  total_sessions: number;
  sessions_done: number;
  next_session_at: string | null;
  created_at: string;
}
interface Client { id: string; name: string; email: string; }
interface SessionLog { id: string; session_date: string; notes: string; next_actions: string; }
interface Recording { id: string; title: string; session_label: string | null; public_url: string; media_type: string; }

interface DetailData {
  client: Client;
  enrollments: Enrollment[];
  activeEnrollmentId: string | null;
  activeLogs: SessionLog[];
  recordings: Recording[];
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  complete: 'bg-stone-200 text-stone-600',
};

export function ClientDetailView({ clientId }: { clientId: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Nav />
        <div className="py-16 flex justify-center">
          <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Nav />
        <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-stone-500">Client not found.</div>
      </div>
    );
  }

  const active = data.enrollments.find((e) => e.id === data.activeEnrollmentId) ?? null;
  const past = data.enrollments.filter((e) => e.id !== data.activeEnrollmentId);

  return (
    <div className="min-h-screen bg-stone-50">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/clients" className="text-sm text-stone-400 hover:text-stone-600">← All clients</Link>
        <div className="mt-2 mb-6">
          <h1 className="text-xl font-semibold text-stone-800">{data.client.name}</h1>
          <p className="text-sm text-stone-500">{data.client.email}</p>
        </div>

        {active ? (
          <ActiveEnrollment enrollment={active} logs={data.activeLogs} recordings={data.recordings} onChange={load} />
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 text-sm text-stone-500">
            No active program. Start a new pack below.
          </div>
        )}

        <StartNewPack clientId={clientId} onCreated={load} />

        {past.length > 0 && <PastPacks enrollments={past} />}
      </div>
    </div>
  );
}

function ActiveEnrollment({
  enrollment, logs, recordings, onChange,
}: { enrollment: Enrollment; logs: SessionLog[]; recordings: Recording[]; onChange: () => void }) {
  const suggestComplete = enrollment.sessions_done >= enrollment.total_sessions && enrollment.status !== 'complete';

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/enrollments/${enrollment.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    onChange();
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize bg-stone-100 text-stone-600">
            {enrollment.program_type}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[enrollment.status]}`}>
            {enrollment.status}
          </span>
        </div>
        <p className="text-sm font-medium text-stone-700">
          {enrollment.sessions_done} of {enrollment.total_sessions} sessions
        </p>
      </div>

      {suggestComplete && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-sm text-green-800">All sessions logged — mark this program complete?</span>
          <button onClick={() => patch({ status: 'complete' })}
            className="text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg px-3 py-1">
            Mark complete
          </button>
        </div>
      )}

      <GoalEditor enrollment={enrollment} onSave={(goal) => patch({ goal })} />
      <NextSessionEditor enrollment={enrollment} onSave={(nextSessionAt) => patch({ nextSessionAt })} />

      {/* Status controls */}
      <div className="flex gap-2">
        {(['active', 'paused', 'complete'] as const).map((s) => (
          <button key={s} onClick={() => patch({ status: s })} disabled={enrollment.status === s}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
              enrollment.status === s ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}>
            {s}
          </button>
        ))}
      </div>

      <SessionLogger enrollmentId={enrollment.id} onLogged={onChange} />
      <SessionHistory logs={logs} />
      <RecordingsSection enrollmentId={enrollment.id} recordings={recordings} onChange={onChange} />
    </div>
  );
}

function GoalEditor({ enrollment, onSave }: { enrollment: Enrollment; onSave: (g: string) => void }) {
  const [goal, setGoal] = useState(enrollment.goal);
  const dirty = goal !== enrollment.goal;
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1">Goal</label>
      <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none" />
      {dirty && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(goal)} className="text-xs bg-stone-800 text-white rounded-lg px-3 py-1 font-medium">Save goal</button>
          <button onClick={() => setGoal(enrollment.goal)} className="text-xs text-stone-500 px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

function NextSessionEditor({ enrollment, onSave }: { enrollment: Enrollment; onSave: (d: string | null) => void }) {
  // datetime-local needs 'YYYY-MM-DDTHH:mm'
  const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
  const [val, setVal] = useState(toLocal(enrollment.next_session_at));
  const dirty = val !== toLocal(enrollment.next_session_at);
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1">Next session</label>
      <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)}
        className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
      {dirty && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(val ? new Date(val).toISOString() : null)}
            className="text-xs bg-stone-800 text-white rounded-lg px-3 py-1 font-medium">Save</button>
          <button onClick={() => setVal(toLocal(enrollment.next_session_at))} className="text-xs text-stone-500 px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

function SessionLogger({ enrollmentId, onLogged }: { enrollmentId: string; onLogged: () => void }) {
  const [notes, setNotes] = useState('');
  const [nextActions, setNextActions] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/enrollments/${enrollmentId}/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, nextActions }),
    });
    setNotes(''); setNextActions(''); setSaving(false);
    onLogged();
  }

  return (
    <form onSubmit={submit} className="border-t border-stone-100 pt-5 space-y-3">
      <h3 className="text-sm font-medium text-stone-700">Log a session</h3>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What happened this session…"
        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none" />
      <input type="text" value={nextActions} onChange={(e) => setNextActions(e.target.value)} placeholder="Assigned for next session (optional)"
        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
      <button type="submit" disabled={saving || !notes.trim()}
        className="bg-stone-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-stone-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Log session'}
      </button>
    </form>
  );
}

function SessionHistory({ logs }: { logs: SessionLog[] }) {
  if (logs.length === 0) return null;
  return (
    <div className="border-t border-stone-100 pt-5">
      <h3 className="text-sm font-medium text-stone-700 mb-3">Session history ({logs.length})</h3>
      <div className="space-y-3">
        {logs.map((l) => (
          <div key={l.id} className="border border-stone-200 rounded-lg p-3">
            <p className="text-xs text-stone-400 mb-1">{fmtDate(l.session_date)}</p>
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{l.notes}</p>
            {l.next_actions && <p className="text-xs text-stone-500 mt-2"><span className="font-medium">Next:</span> {l.next_actions}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecordingsSection({ enrollmentId, recordings, onChange }: { enrollmentId: string; recordings: Recording[]; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
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
      const res = await fetch(`/api/enrollments/${enrollmentId}/recordings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, publicUrl: url, r2Key: r2KeyFromUrl(url), mediaType, sessionLabel: label || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to attach');
      setTitle(''); setUrl(''); setLabel(''); setShowAdd(false);
      onChange();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-stone-100 pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-stone-700">Recordings ({recordings.length})</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2">
          {showAdd ? 'Cancel' : '+ Attach recording'}
        </button>
      </div>

      {recordings.length > 0 && (
        <div className="space-y-2 mb-3">
          {recordings.map((r) => (
            <div key={r.id} className="flex items-center justify-between border border-stone-200 rounded-lg p-2.5">
              <div className="min-w-0">
                <p className="text-sm text-stone-700 truncate">{r.title}</p>
                {r.session_label && <p className="text-xs text-stone-400">{r.session_label}</p>}
              </div>
              <a href={r.public_url} target="_blank" rel="noreferrer" className="text-xs text-stone-500 hover:text-stone-700 shrink-0 ml-2">Open</a>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <form onSubmit={attach} className="space-y-2 bg-stone-50 rounded-lg p-3">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required disabled={saving}
            className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="R2 file URL (https://…)" required disabled={saving}
            className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Session label (optional, e.g. Session 1)" disabled={saving}
            className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={saving || !title || !url}
            className="bg-stone-800 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-stone-700 disabled:opacity-50">
            {saving ? 'Attaching…' : 'Attach'}
          </button>
        </form>
      )}
    </div>
  );
}

function StartNewPack({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [totalSessions, setTotalSessions] = useState('6');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/clients/${clientId}/enrollments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, totalSessions: parseInt(totalSessions, 10) || 6 }),
    });
    setGoal(''); setTotalSessions('6'); setSaving(false); setOpen(false);
    onCreated();
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-sm text-stone-600 hover:text-stone-800 font-medium">
          + Start a new pack
        </button>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <h3 className="text-sm font-medium text-stone-700">Start a new program (pack)</h3>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="Goal for this pack"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none" />
          <input type="number" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} min="1"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 border border-stone-300 text-stone-600 rounded-lg py-2 text-sm font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-stone-800 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? 'Creating…' : 'Create pack'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function PastPacks({ enrollments }: { enrollments: Enrollment[] }) {
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-stone-600 mb-3">Past programs ({enrollments.length})</h2>
      <div className="space-y-2">
        {enrollments.map((e) => <PastPackRow key={e.id} enrollment={e} />)}
      </div>
    </div>
  );
}

function PastPackRow({ enrollment }: { enrollment: Enrollment }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<SessionLog[] | null>(null);

  async function toggle() {
    setOpen(!open);
    if (!open && logs === null) {
      const res = await fetch(`/api/enrollments/${enrollment.id}/sessions`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200">
      <button onClick={toggle} className="w-full flex items-center justify-between p-4 text-left">
        <div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[enrollment.status]}`}>{enrollment.status}</span>
          <span className="text-sm text-stone-600 ml-2">{enrollment.goal || 'No goal'}</span>
        </div>
        <span className="text-sm text-stone-400">{enrollment.sessions_done}/{enrollment.total_sessions} · {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {logs === null ? (
            <p className="text-xs text-stone-400">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-stone-400">No session logs.</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="border border-stone-200 rounded-lg p-3">
                <p className="text-xs text-stone-400 mb-1">{fmtDate(l.session_date)}</p>
                <p className="text-sm text-stone-700 whitespace-pre-wrap">{l.notes}</p>
                {l.next_actions && <p className="text-xs text-stone-500 mt-2"><span className="font-medium">Next:</span> {l.next_actions}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
