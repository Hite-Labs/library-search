'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { PencilIcon } from '@/components/PencilIcon';

// Sentence-case the first character (display only).
function initialCap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Manrope input-label style (reserve Oswald/font-label for headers & subheaders).
const INPUT_LABEL = 'block text-xs font-medium uppercase tracking-wide text-slate/70 mb-1';

// Pipe separator for the metadata label line.
const PIPE = <span className="text-slate/40">|</span>;

interface Cohort {
  id: string; name: string; description: string; goal: string;
  total_sessions: number; current_session: number; status: 'active' | 'complete' | 'archived';
  zoom_url: string; telegram_url: string;
  start_date: string | null; session_cadence: 'weekly' | 'biweekly';
}
interface CohortSession { id: string; session_date: string | null; label: string; sort_order: number; prompt_text: string; }
interface Member { enrollment_id: string; client_id: string; client_name: string; client_email: string; goal: string; status: string; }
interface Content { id: string; title: string; public_url: string; media_type: string; cohort_session_id: string | null; }
interface DetailData { cohort: Cohort; sessions: CohortSession[]; roster: Member[]; content: Content[]; }

const RESOURCE_ACCEPT = '.mp3,.wav,.m4a,.mp4,.mov,.pdf';

function uploadMediaType(file: File): 'audio' | 'video' | 'pdf' {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov')) return 'video';
  return 'audio';
}

function uploadContentType(file: File): string {
  if (file.name.toLowerCase().endsWith('.m4a')) return 'audio/x-m4a';
  if (file.name.toLowerCase().endsWith('.mov')) return 'video/quicktime';
  return file.type || 'application/octet-stream';
}

// datetime-local expects "YYYY-MM-DDTHH:mm" in local time; convert an ISO string for editing.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateTime(d: string | null): string {
  if (!d) return 'No date set';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CohortDetailView({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);

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
        <div className="flex items-center justify-between">
          <Link href="/cohorts" className="text-sm text-slate/60 hover:text-slate">← All cohorts</Link>
          <button onClick={() => setPreview((p) => !p)} className="btn-spark-outline text-xs px-3 py-1.5">
            {preview ? 'Exit preview' : 'Preview portal'}
          </button>
        </div>

        {preview ? (
          <CohortPreview cohort={cohort} sessions={data.sessions} content={data.content} />
        ) : (
          <>
            <CohortHeader cohort={cohort} onPatch={patchCohort} />
            <ScheduleSection cohortId={cohortId} cohort={cohort} sessions={data.sessions} onChange={load} />
            <SharedContentSection cohortId={cohortId} content={data.content} sessions={data.sessions} onChange={load} />
            <RosterSection cohortId={cohortId} roster={data.roster} onChange={load} />
          </>
        )}
      </div>
    </div>
  );
}

// Consolidated cohort header: name + metadata label line (type | status | progress)
// with inline +/- session steppers, the shared goal, the Zoom link, and a pencil
// popup for editing goal / total sessions / status.
function CohortHeader({ cohort, onPatch }: { cohort: Cohort; onPatch: (body: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="mt-2 mb-6">
      <h1 className="text-xl font-serif text-slate mb-4">{cohort.name}</h1>

      <div className="bg-white rounded-2xl border border-gold/20 p-6 space-y-4">
      {/* Metadata label line — Oswald, regular weight, pipe-separated (no badges). */}
      <div className="flex items-center gap-2 font-label font-normal text-sm text-slate capitalize">
        <span>Cohort</span>
        {PIPE}
        <span>{cohort.status}</span>
        {PIPE}
        <span className="flex items-center gap-2">
          Session {cohort.current_session} of {cohort.total_sessions}
          <span className="inline-flex gap-1">
            <button onClick={() => onPatch({ currentSession: Math.max(0, cohort.current_session - 1) })}
              disabled={cohort.current_session <= 0} aria-label="Previous session"
              className="w-6 h-6 rounded-lg border border-gold/30 text-plum hover:bg-petal disabled:opacity-40 normal-case">−</button>
            <button onClick={() => onPatch({ currentSession: cohort.current_session + 1 })} aria-label="Next session"
              className="w-6 h-6 rounded-lg border border-gold/30 text-plum hover:bg-petal normal-case">+</button>
          </span>
        </span>
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit cohort details"
          className="ml-1 text-slate/50 hover:text-gold transition-colors">
          <PencilIcon />
        </button>
      </div>

      {/* Shared goal value with a small label beneath. */}
      <div>
        <p className="text-base text-slate">{cohort.goal ? initialCap(cohort.goal) : '—'}</p>
        <span className="font-label font-normal text-xs text-slate/60">Goal</span>
      </div>

      <ZoomEditor cohort={cohort} onSave={(zoomUrl) => onPatch({ zoomUrl })} />
      <TelegramEditor cohort={cohort} onSave={(telegramUrl) => onPatch({ telegramUrl })} />
      </div>

      {editing && (
        <EditCohortModal
          cohort={cohort}
          onClose={() => setEditing(false)}
          onSave={(body) => { onPatch(body); setEditing(false); }}
        />
      )}
    </div>
  );
}

// Popup to edit shared goal / total sessions / status in one place.
function EditCohortModal({
  cohort, onClose, onSave,
}: { cohort: Cohort; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [goal, setGoal] = useState(cohort.goal);
  const [totalSessions, setTotalSessions] = useState(String(cohort.total_sessions));
  const [status, setStatus] = useState(cohort.status);

  function save() {
    const body: Record<string, unknown> = { goal, status };
    const n = parseInt(totalSessions, 10);
    if (n > 0) body.totalSessions = n;
    onSave(body);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-serif text-slate mb-4">Edit cohort</h2>
        <div className="space-y-4">
          <div>
            <label className={INPUT_LABEL}>Shared goal / theme</label>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none" />
          </div>
          <div>
            <label className={INPUT_LABEL}>Number of sessions</label>
            <input type="number" min="1" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)}
              className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          </div>
          <div>
            <label className={INPUT_LABEL}>Status</label>
            <div className="flex gap-2">
              {(['active', 'complete', 'archived'] as const).map((s) => (
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

// Shared Zoom link: editable field + copy button + open link.
function ZoomEditor({ cohort, onSave }: { cohort: Cohort; onSave: (url: string) => void }) {
  const [url, setUrl] = useState(cohort.zoom_url);
  const [copied, setCopied] = useState(false);
  const dirty = url !== cohort.zoom_url;
  return (
    <div>
      <label className={`${INPUT_LABEL} normal-case`}>Zoom link <span className="font-normal lowercase text-slate/50">(shared weekly)</span></label>
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

// Shared Telegram link: async/live chat, surfaced prominently in the portal cohort tab.
function TelegramEditor({ cohort, onSave }: { cohort: Cohort; onSave: (url: string) => void }) {
  const [url, setUrl] = useState(cohort.telegram_url);
  const [copied, setCopied] = useState(false);
  const dirty = url !== cohort.telegram_url;
  return (
    <div>
      <label className={`${INPUT_LABEL} normal-case`}>Telegram link <span className="font-normal lowercase text-slate/50">(shared chat)</span></label>
      <div className="flex gap-2">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://t.me/…"
          className="flex-1 border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        {cohort.telegram_url && !dirty && (
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(cohort.telegram_url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
            className="btn-spark-outline text-xs px-3 shrink-0">{copied ? 'Copied!' : 'Copy'}</button>
        )}
      </div>
      {dirty && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(url)} className="btn-spark text-xs px-3 py-1">Save</button>
          <button onClick={() => setUrl(cohort.telegram_url)} className="btn-spark-outline text-xs px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

function ScheduleSection({ cohortId, cohort, sessions, onChange }: { cohortId: string; cohort: Cohort; sessions: CohortSession[]; onChange: () => void }) {
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [showGen, setShowGen] = useState(false);

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
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-label text-xs text-plum">Schedule</h2>
        <button onClick={() => setShowGen((v) => !v)} className="btn-spark-outline text-xs px-3 py-1.5">
          {showGen ? 'Cancel' : 'Generate schedule'}
        </button>
      </div>

      {showGen && (
        <GenerateSchedule cohortId={cohortId} cohort={cohort} hasSessions={sessions.length > 0}
          onDone={() => { setShowGen(false); onChange(); }} />
      )}

      {sessions.length > 0 && (
        <div className="space-y-2 mb-4">
          {sessions.map((s, i) => (
            <SessionRow key={s.id} cohortId={cohortId} session={s} index={i} onChange={onChange} onRemove={() => remove(s.id)} />
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className={INPUT_LABEL}>Label</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Session 1: Intro" disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div>
          <label className={INPUT_LABEL}>Date/time</label>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving}
            className="border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <button type="submit" disabled={saving || !label}
          className="btn-spark px-3 py-1.5 disabled:opacity-50">Add</button>
      </form>
    </div>
  );
}

// Auto-plot the cohort's dated sessions from a start date + cadence + count.
function GenerateSchedule({ cohortId, cohort, hasSessions, onDone }: {
  cohortId: string; cohort: Cohort; hasSessions: boolean; onDone: () => void;
}) {
  const [start, setStart] = useState(toLocalInput(cohort.start_date));
  const [cadence, setCadence] = useState<'weekly' | 'biweekly'>(cohort.session_cadence);
  const [total, setTotal] = useState(String(cohort.total_sessions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const n = parseInt(total, 10);
      if (!start || !(n > 0)) throw new Error('Start date and a positive session count are required');
      // Persist the cadence/start on the cohort so re-generation and the preview stay in sync.
      await fetch(`/api/cohorts/${cohortId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: new Date(start).toISOString(), sessionCadence: cadence, totalSessions: n }),
      });
      const res = await fetch(`/api/cohorts/${cohortId}/sessions/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: new Date(start).toISOString(), cadence, totalSessions: n }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to generate schedule');
      onDone();
    } catch (err) { setError(String(err instanceof Error ? err.message : err)); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={generate} className="space-y-2 bg-petal/40 rounded-lg p-3 mb-4">
      {hasSessions && <p className="text-xs text-amber-700">This cohort already has sessions — generating adds a new set of rows (it does not replace existing ones).</p>}
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className={INPUT_LABEL}>Start date/time</label>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={saving}
            className="border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div>
          <label className={INPUT_LABEL}>Cadence</label>
          <div className="flex gap-1">
            {(['weekly', 'biweekly'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCadence(c)} disabled={saving}
                className={`px-3 py-1.5 rounded-lg font-label text-xs capitalize transition-colors ${
                  cadence === c ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal border border-gold/20'
                }`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="w-24">
          <label className={INPUT_LABEL}># Sessions</label>
          <input type="number" min="1" value={total} onChange={(e) => setTotal(e.target.value)} disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="btn-spark px-3 py-1.5 disabled:opacity-50">
        {saving ? 'Generating…' : 'Generate'}
      </button>
    </form>
  );
}

// One schedule row: editable date + discussion prompt, saved on blur / explicit save.
function SessionRow({ cohortId, session, index, onChange, onRemove }: {
  cohortId: string; session: CohortSession; index: number; onChange: () => void; onRemove: () => void;
}) {
  const [date, setDate] = useState(toLocalInput(session.session_date));
  const [prompt, setPrompt] = useState(session.prompt_text);
  const [saving, setSaving] = useState(false);
  const dirty = date !== toLocalInput(session.session_date) || prompt !== session.prompt_text;

  async function save() {
    setSaving(true);
    await fetch(`/api/cohorts/${cohortId}/sessions/${session.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionDate: date ? new Date(date).toISOString() : null, promptText: prompt }),
    });
    setSaving(false);
    onChange();
  }

  return (
    <div className="border border-gold/20 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate">{session.label || `Session ${index + 1}`}</span>
        <div className="flex items-center gap-2 shrink-0">
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving}
            className="border border-slate/20 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gold" />
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">Remove</button>
        </div>
      </div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} disabled={saving}
        placeholder="Discussion prompt (shown to members for this session)"
        className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none" />
      {dirty && (
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn-spark text-xs px-3 py-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setDate(toLocalInput(session.session_date)); setPrompt(session.prompt_text); }}
            className="btn-spark-outline text-xs px-2 py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}

function SharedContentSection({ cohortId, content, sessions, onChange }: { cohortId: string; content: Content[]; sessions: CohortSession[]; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function r2KeyFromUrl(u: string): string {
    try { return new URL(u).pathname.replace(/^\//, ''); } catch { return ''; }
  }

  function reset() {
    setTitle(''); setFile(null); setUrl(''); setSessionId(''); setShowAdd(false);
    setProgress(null); setError(null);
  }

  // Persist metadata to the cohort content endpoint. cohortSessionId null = cohort-wide.
  async function attachItem(args: { publicUrl: string; r2Key: string; mediaType: string }) {
    const res = await fetch(`/api/cohorts/${cohortId}/content`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, cohortSessionId: sessionId || null, ...args }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? 'Failed to attach');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setProgress(null);
    try {
      if (mode === 'upload') {
        if (!file) throw new Error('Choose a file first');
        const mediaType = uploadMediaType(file);
        setProgress('Getting upload URL…');
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: uploadContentType(file), mediaType }),
        });
        if (!presignRes.ok) throw new Error('Failed to get upload URL');
        const presign = await presignRes.json();

        setProgress('Uploading…');
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT', body: file, headers: { 'Content-Type': uploadContentType(file) },
        });
        if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

        setProgress('Saving…');
        await attachItem({ publicUrl: presign.publicUrl, r2Key: presign.r2Key, mediaType });
      } else {
        const mediaType = /\.(mp4|mov|webm)$/i.test(url) ? 'video' : /\.pdf$/i.test(url) ? 'pdf' : 'audio';
        await attachItem({ publicUrl: url, r2Key: r2KeyFromUrl(url), mediaType });
      }
      reset();
      onChange();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false); setProgress(null);
    }
  }

  const canSubmit = !!title && (mode === 'upload' ? !!file : !!url);
  const sessionLabel = (id: string | null) => {
    if (!id) return null;
    const idx = sessions.findIndex((s) => s.id === id);
    return idx >= 0 ? sessions[idx].label || `Session ${idx + 1}` : null;
  };

  return (
    <div className="bg-white rounded-2xl border border-gold/20 p-6 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-label text-xs text-plum">Shared content <span className="font-normal text-slate/60">(all members see)</span></h2>
        <button onClick={() => (showAdd ? reset() : setShowAdd(true))} className="btn-spark-outline text-xs px-3 py-1.5">
          {showAdd ? 'Cancel' : 'Attach content'}
        </button>
      </div>
      {content.length > 0 && (
        <div className="space-y-2 mb-3">
          {content.map((c) => (
            <div key={c.id} className="flex items-center justify-between border border-gold/20 rounded-lg p-2.5">
              <div className="min-w-0">
                <span className="text-sm text-slate truncate block">{c.title}</span>
                {sessionLabel(c.cohort_session_id) && (
                  <span className="text-xs text-slate/60">{sessionLabel(c.cohort_session_id)}</span>
                )}
              </div>
              <a href={c.public_url} target="_blank" rel="noreferrer" className="text-xs text-slate/60 hover:text-slate shrink-0 ml-2">Open</a>
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <form onSubmit={submit} className="space-y-2 bg-petal/40 rounded-lg p-3">
          <div className="flex gap-1">
            {(['upload', 'url'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} disabled={saving}
                className={`px-3 py-1 rounded-lg font-label text-xs capitalize transition-colors ${
                  mode === m ? 'bg-plum text-gold' : 'text-slate/70 hover:bg-petal'
                }`}>
                {m === 'upload' ? 'Upload file' : 'Paste URL'}
              </button>
            ))}
          </div>

          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />

          {mode === 'upload' ? (
            <div>
              <input type="file" accept={RESOURCE_ACCEPT} disabled={saving}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-plum file:text-gold hover:file:bg-plum/90" />
              {file && (
                <p className="text-xs text-slate/60 mt-1">
                  {file.name} · {uploadMediaType(file)} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
          ) : (
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="R2 file URL (https://…)" required disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          )}

          <div>
            <label className={INPUT_LABEL}>Attach to session (optional)</label>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold bg-white">
              <option value="">Cohort-wide (no specific session)</option>
              {sessions.map((s, i) => (
                <option key={s.id} value={s.id}>{s.label || `Session ${i + 1}`}</option>
              ))}
            </select>
          </div>

          {progress && <p className="text-xs text-gold animate-pulse">{progress}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={saving || !canSubmit}
            className="btn-spark disabled:opacity-50">
            {saving ? 'Working…' : mode === 'upload' ? 'Upload & attach' : 'Attach'}
          </button>
        </form>
      )}
    </div>
  );
}

// Read-only render of what the portal cohort tab will show, so Lindsay can sanity-check
// content/dates/prompts before members see it. Mirrors the /api/portal cohort shape.
function CohortPreview({ cohort, sessions, content }: { cohort: Cohort; sessions: CohortSession[]; content: Content[] }) {
  const filesFor = (sid: string) => content.filter((c) => c.cohort_session_id === sid);
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white rounded-2xl border border-gold/20 p-6">
        <p className="font-label text-xs text-plum mb-1">Portal preview</p>
        <h1 className="text-xl font-serif text-slate">{cohort.name}</h1>
        {cohort.telegram_url && (
          <a href={cohort.telegram_url} target="_blank" rel="noreferrer"
            className="inline-block mt-3 btn-spark text-sm px-4 py-2">Open group chat (Telegram)</a>
        )}
        {cohort.zoom_url && (
          <p className="text-sm text-slate/70 mt-3">Live sessions: <a href={cohort.zoom_url} target="_blank" rel="noreferrer" className="text-gold underline">Zoom link</a></p>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-gold/20 p-6 space-y-3">
        <h2 className="font-label text-xs text-plum">Sessions</h2>
        {sessions.length === 0 && <p className="text-sm text-slate/60">No sessions scheduled yet.</p>}
        {sessions.map((s, i) => (
          <div key={s.id} className="border border-gold/20 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate">{s.label || `Session ${i + 1}`}</span>
              <span className="text-xs text-slate/60">{fmtDateTime(s.session_date)}</span>
            </div>
            {s.prompt_text && <p className="text-sm text-slate/80 mt-2 whitespace-pre-wrap">{s.prompt_text}</p>}
            {filesFor(s.id).length > 0 && (
              <div className="mt-2 space-y-1">
                {filesFor(s.id).map((f) => (
                  <a key={f.id} href={f.public_url} target="_blank" rel="noreferrer"
                    className="block text-xs text-gold underline">{f.title} ({f.media_type})</a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
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
        <button onClick={() => setShowAdd(!showAdd)} className="btn-spark-outline text-xs px-3 py-1.5">
          {showAdd ? 'Cancel' : 'Add member'}
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
