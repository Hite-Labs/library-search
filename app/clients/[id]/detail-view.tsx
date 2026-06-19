'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { PencilIcon } from '@/components/PencilIcon';

interface Enrollment {
  id: string;
  program_type: string;
  goal: string;
  status: 'active' | 'paused' | 'complete';
  total_sessions: number;
  sessions_done: number;
  next_session_at: string | null;
  calendar_url: string;
  created_at: string;
}
interface Client { id: string; name: string; email: string; }
interface SessionLog { id: string; session_date: string; notes: string; next_actions: string; coach_actions: string; }
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

// Sentence-case the first character (display only) — goal shows with an initial cap
// even when the stored text wasn't capitalized.
function initialCap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Manrope input-label style (reserve Oswald/font-label for headers & subheaders).
const INPUT_LABEL = 'block text-xs font-medium uppercase tracking-wide text-slate/70 mb-1';

// Pipe separator for the metadata label line.
const PIPE = <span className="text-slate/40">|</span>;

// Global booking link (set NEXT_PUBLIC_BOOKING_URL). Used as the default when a
// client has no per-enrollment calendar link saved yet.
const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? '';

// Still used by PastPackRow to tint historical-program status badges.
const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  complete: 'bg-petal text-plum',
};

// Small "copy to clipboard" button with a brief confirmation. Renders nothing if no value.
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — no-op */ }
      }}
      className="btn-spark-outline text-xs px-3 py-1.5 shrink-0"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

// Page header: client identity + active-enrollment metadata (type | status | progress),
// the goal, the per-client calendar link, and a pencil that opens the edit popup.
function ClientHeader({
  client, enrollment, onChange,
}: { client: Client; enrollment: Enrollment | null; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const isCohort = enrollment?.program_type === 'cohort';
  const typeLabel = enrollment?.program_type === 'cohort' ? 'Cohort' : 'Individual';
  const calendarLink = enrollment?.calendar_url || BOOKING_URL;

  async function patch(body: Record<string, unknown>) {
    if (!enrollment) return;
    await fetch(`/api/enrollments/${enrollment.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    onChange();
  }

  return (
    <div className="mt-2 mb-6">
      <h1 className="text-xl font-serif text-slate">{client.name}</h1>
      <p className="text-sm text-slate/60">{client.email}</p>

      {enrollment && (
        <>
          {/* Metadata label line — Oswald, regular weight, pipe-separated (no badges). */}
          <div className="mt-3 flex items-center gap-2 font-label font-normal text-sm text-slate capitalize">
            <span>{typeLabel}</span>
            {PIPE}
            <span>{enrollment.status}</span>
            {!isCohort && (
              <>
                {PIPE}
                <span>Session {enrollment.sessions_done} of {enrollment.total_sessions}</span>
              </>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit program details"
              className="ml-1 text-slate/50 hover:text-gold transition-colors"
            >
              <PencilIcon />
            </button>
          </div>

          {/* Goal value with a small label beneath. */}
          <div className="mt-3">
            <p className="text-base text-slate">{enrollment.goal ? initialCap(enrollment.goal) : '—'}</p>
            <span className="font-label font-normal text-xs text-slate/60">Goal</span>
          </div>

          {/* Per-client calendar / scheduling link Lindsay can copy & send. */}
          <CalendarLinkEditor enrollment={enrollment} onSave={(calendarUrl) => patch({ calendarUrl })} defaultUrl={calendarLink} />

          {editing && (
            <EditEnrollmentModal
              enrollment={enrollment}
              isCohort={isCohort}
              onClose={() => setEditing(false)}
              onSave={async (body) => { await patch(body); setEditing(false); }}
            />
          )}
        </>
      )}
    </div>
  );
}

// Editable per-client scheduling link with a copy action (mirrors the cohort ZoomEditor).
function CalendarLinkEditor({
  enrollment, onSave, defaultUrl,
}: { enrollment: Enrollment; onSave: (url: string) => void; defaultUrl: string }) {
  const [url, setUrl] = useState(enrollment.calendar_url);
  const dirty = url !== enrollment.calendar_url;
  const copyValue = enrollment.calendar_url || defaultUrl;
  return (
    <div className="mt-4">
      <label className={INPUT_LABEL}>Calendar link</label>
      <div className="flex gap-2">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cal.com/…"
          className="flex-1 border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        {copyValue && !dirty && <CopyButton value={copyValue} label="Copy link" />}
      </div>
      {dirty && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(url)} className="btn-spark text-xs px-3 py-1">Save</button>
          <button onClick={() => setUrl(enrollment.calendar_url)} className="btn-spark-outline text-xs px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

// Popup to edit goal / number of sessions / status in one place (replaces the
// scattered inline editors and badge-row controls).
function EditEnrollmentModal({
  enrollment, isCohort, onClose, onSave,
}: { enrollment: Enrollment; isCohort: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [goal, setGoal] = useState(enrollment.goal);
  const [totalSessions, setTotalSessions] = useState(String(enrollment.total_sessions));
  const [status, setStatus] = useState(enrollment.status);

  function save() {
    const body: Record<string, unknown> = { goal, status };
    const n = parseInt(totalSessions, 10);
    if (!isCohort && n > 0) body.totalSessions = n;
    onSave(body);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-serif text-slate mb-4">Edit program</h2>
        <div className="space-y-4">
          <div>
            <label className={INPUT_LABEL}>Goal</label>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none" />
          </div>
          {!isCohort && (
            <div>
              <label className={INPUT_LABEL}>Number of sessions</label>
              <input type="number" min="1" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)}
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
          )}
          <div>
            <label className={INPUT_LABEL}>Status</label>
            <div className="flex gap-2">
              {(['active', 'paused', 'complete'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`font-label text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                    status === s ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal border border-gold/20'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-spark-outline flex-1">Cancel</button>
            <button type="button" onClick={save} className="btn-spark flex-1">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-slate/60">Client not found.</div>
      </div>
    );
  }

  const active = data.enrollments.find((e) => e.id === data.activeEnrollmentId) ?? null;
  const past = data.enrollments.filter((e) => e.id !== data.activeEnrollmentId);

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/clients" className="text-sm text-slate/60 hover:text-slate">← All clients</Link>
        <ClientHeader client={data.client} enrollment={active} onChange={load} />

        {active ? (
          <ActiveEnrollment enrollment={active} logs={data.activeLogs} recordings={data.recordings} onChange={load} />
        ) : (
          <div className="bg-white rounded-2xl border border-gold/20 p-6 text-sm text-slate/60">
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
  const isCohort = enrollment.program_type === 'cohort';
  const suggestComplete = !isCohort && enrollment.sessions_done >= enrollment.total_sessions && enrollment.status !== 'complete';

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/enrollments/${enrollment.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    onChange();
  }

  return (
    <div className="bg-white rounded-2xl border border-gold/20 p-6 space-y-6">
      {/* Cohort members inherit the cohort's schedule + progress (no individual counter/logger). */}
      {isCohort && <CohortInfo enrollmentId={enrollment.id} />}

      {suggestComplete && (
        <div className="bg-gold/10 border border-gold/30 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-sm text-plum">All sessions logged — mark this program complete?</span>
          <button onClick={() => patch({ status: 'complete' })}
            className="btn-spark text-sm px-3 py-1">
            Mark complete
          </button>
        </div>
      )}

      {/* Individual-only controls: session logging/history, then next session */}
      {!isCohort && (
        <>
          <SessionLogger enrollmentId={enrollment.id} onLogged={onChange} />
          {/* Next session sits BELOW the log (after note-taking, not before) */}
          <NextSessionEditor enrollment={enrollment} onSave={(nextSessionAt) => patch({ nextSessionAt })} />
          <SessionHistory logs={logs} />
        </>
      )}

      {/* Private individual recordings — available in both program types
          (a cohort member can still get a personal asset only they see). */}
      <RecordingsSection enrollmentId={enrollment.id} recordings={recordings} onChange={onChange} />
    </div>
  );
}

// For a cohort member: show which cohort they're in + the cohort's session schedule
// and current progress (inherited from the cohort, not tracked per-member).
function CohortInfo({ enrollmentId }: { enrollmentId: string }) {
  const [cohort, setCohort] = useState<{ id: string; name: string; current_session: number; total_sessions: number; zoom_url: string } | null>(null);
  const [sessions, setSessions] = useState<{ id: string; label: string; session_date: string | null }[]>([]);

  useEffect(() => {
    fetch(`/api/enrollments/${enrollmentId}/cohort`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setCohort(d.cohort); setSessions(d.sessions ?? []); } })
      .catch(() => {});
  }, [enrollmentId]);

  if (!cohort) return null;

  return (
    <div className="bg-petal/50 border border-gold/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <Link href={`/cohorts/${cohort.id}`} className="text-sm font-serif text-plum hover:underline">
          {cohort.name}
        </Link>
        <span className="text-sm text-plum">Session {cohort.current_session} of {cohort.total_sessions}</span>
      </div>
      {sessions.length > 0 && (
        <ul className="space-y-1">
          {sessions.map((s, i) => {
            const done = i < cohort.current_session;
            return (
              <li key={s.id} className="text-sm flex items-center gap-2">
                <span className={done ? 'text-green-600' : 'text-slate/30'}>{done ? '✓' : '○'}</span>
                <span className={done ? 'text-slate' : 'text-slate/60'}>{s.label || `Session ${i + 1}`}</span>
                {s.session_date && <span className="text-xs text-slate/60">· {fmtDate(s.session_date)}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {cohort.zoom_url && (
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gold/15">
          <a href={cohort.zoom_url} target="_blank" rel="noreferrer" className="text-sm text-plum hover:underline truncate">
            Zoom link
          </a>
          <CopyButton value={cohort.zoom_url} label="Copy Zoom" />
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
      <label className={INPUT_LABEL}>Next session</label>
      <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)}
        className="border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
      {dirty && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(val ? new Date(val).toISOString() : null)}
            className="btn-spark text-xs px-3 py-1">Save</button>
          <button onClick={() => setVal(toLocal(enrollment.next_session_at))} className="btn-spark-outline text-xs px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

function SessionLogger({ enrollmentId, onLogged }: { enrollmentId: string; onLogged: () => void }) {
  const [notes, setNotes] = useState('');
  const [nextActions, setNextActions] = useState('');
  const [coachActions, setCoachActions] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/enrollments/${enrollmentId}/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, nextActions, coachActions }),
    });
    setNotes(''); setNextActions(''); setCoachActions(''); setSaving(false);
    onLogged();
  }

  return (
    <form onSubmit={submit} className="border-t border-gold/10 pt-5 space-y-3">
      <h3 className="font-label text-xs text-plum">Log a session</h3>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} placeholder="What happened this session…"
        className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-y" />
      <div>
        <label className={INPUT_LABEL}>Client actions</label>
        <input type="text" value={nextActions} onChange={(e) => setNextActions(e.target.value)} placeholder="Tasks & tools the client owns"
          className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
      </div>
      <div>
        <label className={INPUT_LABEL}>Coach actions</label>
        <input type="text" value={coachActions} onChange={(e) => setCoachActions(e.target.value)} placeholder="Follow-ups Lindsay owns"
          className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
      </div>
      <button type="submit" disabled={saving || !notes.trim()}
        className="btn-spark disabled:opacity-50">
        {saving ? 'Saving…' : 'Log session'}
      </button>
    </form>
  );
}

function SessionHistory({ logs }: { logs: SessionLog[] }) {
  if (logs.length === 0) return null;
  return (
    <div className="border-t border-gold/10 pt-5">
      <h3 className="font-label text-xs text-plum mb-3">Session history ({logs.length})</h3>
      <div className="space-y-3">
        {logs.map((l) => (
          <div key={l.id} className="border border-gold/20 rounded-lg p-3">
            <p className="text-xs text-slate/60 mb-1">{fmtDate(l.session_date)}</p>
            <p className="text-sm text-slate whitespace-pre-wrap">{l.notes}</p>
            {l.next_actions && <p className="text-xs text-slate/60 mt-2"><span className="font-medium">Client actions:</span> {l.next_actions}</p>}
            {l.coach_actions && <p className="text-xs text-slate/60 mt-1"><span className="font-medium">Coach actions:</span> {l.coach_actions}</p>}
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
    <div className="border-t border-gold/10 pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-label text-xs text-plum">Recordings ({recordings.length})</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-spark-outline text-xs px-3 py-1.5">
          {showAdd ? 'Cancel' : 'Attach recording'}
        </button>
      </div>

      {recordings.length > 0 && (
        <div className="space-y-2 mb-3">
          {recordings.map((r) => (
            <div key={r.id} className="flex items-center justify-between border border-gold/20 rounded-lg p-2.5">
              <div className="min-w-0">
                <p className="text-sm text-slate truncate">{r.title}</p>
                {r.session_label && <p className="text-xs text-slate/60">{r.session_label}</p>}
              </div>
              <a href={r.public_url} target="_blank" rel="noreferrer" className="text-xs text-slate/60 hover:text-slate shrink-0 ml-2">Open</a>
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
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Session label (optional, e.g. Session 1)" disabled={saving}
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
        <button onClick={() => setOpen(true)} className="text-sm text-plum hover:text-plum/80 font-medium">
          + Start a new pack
        </button>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-gold/20 p-4 space-y-3">
          <h3 className="font-label text-xs text-plum">Start a new program (pack)</h3>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="Goal for this pack"
            className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none" />
          <input type="number" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} min="1"
            className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-spark-outline flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-spark flex-1 disabled:opacity-50">
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
      <h2 className="font-label text-xs text-plum mb-3">Past programs ({enrollments.length})</h2>
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
    <div className="bg-white rounded-xl border border-gold/20 hover:border-gold/50 transition-all">
      <button onClick={toggle} className="w-full flex items-center justify-between p-4 text-left">
        <div>
          <span className={`font-label text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[enrollment.status]}`}>{enrollment.status}</span>
          <span className="text-sm text-slate ml-2">{enrollment.goal || 'No goal'}</span>
        </div>
        <span className="text-sm text-slate/60">{enrollment.sessions_done}/{enrollment.total_sessions} · {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {logs === null ? (
            <p className="text-xs text-slate/60">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate/60">No session logs.</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="border border-gold/20 rounded-lg p-3">
                <p className="text-xs text-slate/60 mb-1">{fmtDate(l.session_date)}</p>
                <p className="text-sm text-slate whitespace-pre-wrap">{l.notes}</p>
                {l.next_actions && <p className="text-xs text-slate/60 mt-2"><span className="font-medium">Client actions:</span> {l.next_actions}</p>}
                {l.coach_actions && <p className="text-xs text-slate/60 mt-1"><span className="font-medium">Coach actions:</span> {l.coach_actions}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
