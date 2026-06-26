'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
interface Recording { id: string; title: string; session_label: string | null; description: string; public_url: string; media_type: string; }

interface DetailData {
  client: Client;
  enrollments: Enrollment[];
  activeEnrollmentId: string | null;
  activeLogs: SessionLog[];
  recordings: Recording[];
  resources: Recording[];
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
const INPUT_LABEL = 'block text-xs font-medium tracking-wide text-slate/70 mb-1';

// Pipe separator for the metadata label line.
const PIPE = <span className="text-slate/40">|</span>;

// Global booking link (set NEXT_PUBLIC_BOOKING_URL). Used as the default when a
// client has no per-enrollment calendar link saved yet.
const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? '';

// Webflow passwordless login page. The per-client "Copy login link" button (in the header)
// appends ?email=… so the login form can pre-fill the client's email. Empty → button hides.
const PORTAL_LOGIN_URL = process.env.NEXT_PUBLIC_PORTAL_LOGIN_URL ?? '';

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

  async function patch(body: Record<string, unknown>) {
    if (!enrollment) return;
    await fetch(`/api/enrollments/${enrollment.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    onChange();
  }

  return (
    <div className="mt-2 mb-6 flex flex-col md:flex-row items-end gap-6">
      {/* LEFT — identity: name, email, small "Copy login link" text. */}
      <div className="min-w-0">
        <h1 className="text-xl font-serif text-slate">{client.name}</h1>
        <p className="text-sm text-slate/60 mt-0.5 truncate">{client.email}</p>
        {/* Passwordless portal login link, email pre-filled, for Lindsay to share. */}
        <CopyLoginLink email={client.email} />
      </div>

      {/* RIGHT — metadata cluster (far-right) + the goal as a big heading beneath. */}
      {enrollment && (
        <div className="flex-1 min-w-0">
          {/* Metadata label line — Oswald, regular weight, pipe-separated, pushed far-right. */}
          <div className="flex items-center gap-2 font-label font-normal text-[13px] text-slate capitalize">
            <span className="ml-auto">{typeLabel}</span>
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

          {/* Goal — large Baskerville heading, full width, left-aligned (no label). */}
          <h1 className="mt-3 text-3xl font-serif text-slate text-left">
            {enrollment.goal ? initialCap(enrollment.goal) : '—'}
          </h1>

          {editing && (
            <EditEnrollmentModal
              enrollment={enrollment}
              isCohort={isCohort}
              onClose={() => setEditing(false)}
              onSave={async (body) => { await patch(body); setEditing(false); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Small text-style "Copy login link" (was a pill button). Hidden when no portal URL configured.
function CopyLoginLink({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  if (!PORTAL_LOGIN_URL) return null;
  const value = `${PORTAL_LOGIN_URL}?email=${encodeURIComponent(email)}`;
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
      className="mt-1 text-xs text-plum/70 hover:text-plum underline underline-offset-2"
    >
      {copied ? 'Copied!' : 'Copy login link'}
    </button>
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
          <ActiveEnrollment enrollment={active} logs={data.activeLogs} recordings={data.recordings} resources={data.resources} onChange={load} />
        ) : (
          <div className="bg-white rounded-2xl border border-gold/20 p-6 text-sm text-slate/60">
            No active program. Start a new pack below.
          </div>
        )}

        <StartNewPack clientId={clientId} onCreated={load} />

        {past.length > 0 && <PastPacks enrollments={past} />}

        <DangerZone clientId={clientId} clientName={data.client.name} />
      </div>
    </div>
  );
}

// Destructive: delete the client + their enrollments/session logs (cascade) and detach
// recordings. Requires an explicit confirm. The Memberstack member is left in place — to
// fully free the email for a fresh re-test, also remove the member in Memberstack.
function DangerZone({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Delete failed');
      router.push('/clients');
    } catch (err) {
      setError(String(err));
      setDeleting(false);
    }
  }

  return (
    <div className="mt-8 bg-white rounded-2xl border border-scarlet/25 p-5">
      <h3 className="font-label text-xs uppercase tracking-wide text-scarlet mb-1">Danger zone</h3>
      {!confirming ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate/70">
            Delete this client and all of their programs and session notes. Their portal
            account (Memberstack) is left untouched.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-spark-outline shrink-0 border-scarlet/40 text-scarlet hover:bg-scarlet/10"
          >
            Delete client
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate">
            Permanently delete <span className="font-medium">{clientName}</span> and all of
            their programs, session notes, and recording links? This can&apos;t be undone.
          </p>
          {error && (
            <p className="text-sm text-scarlet bg-scarlet/10 border border-scarlet/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setConfirming(false); setError(null); }}
              disabled={deleting}
              className="btn-spark-outline disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="btn-spark bg-scarlet hover:bg-scarlet/90 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Yes, delete permanently'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveEnrollment({
  enrollment, logs, recordings, resources, onChange,
}: { enrollment: Enrollment; logs: SessionLog[]; recordings: Recording[]; resources: Recording[]; onChange: () => void }) {
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

      {/* Individual-only controls: calendar link, then session logging/history + next session */}
      {!isCohort && (
        <>
          {/* Per-client calendar / scheduling link Lindsay can copy & send — sits above the log. */}
          <CalendarLinkEditor enrollment={enrollment} onSave={(calendarUrl) => patch({ calendarUrl })} defaultUrl={enrollment.calendar_url || BOOKING_URL} />
          <SessionLogger enrollmentId={enrollment.id} onLogged={onChange} />
          {/* Next session sits BELOW the log (after note-taking, not before) */}
          <NextSessionEditor enrollment={enrollment} onSave={(nextSessionAt) => patch({ nextSessionAt })} />
          <SessionHistory logs={logs} />
        </>
      )}

      {/* Private individual recordings + resources — available in both program types
          (a cohort member can still get a personal asset only they see).
          Recordings = session Zoom calls (video). Resources = delivered files (video/audio/pdf). */}
      <ClientContentSection
        enrollmentId={enrollment.id} items={recordings} onChange={onChange}
        kind="recording" heading="Recordings" accept={RECORDING_ACCEPT} showLabel showDescription={false}
      />
      <ClientContentSection
        enrollmentId={enrollment.id} items={resources} onChange={onChange}
        kind="file" heading="Resources" accept={RESOURCE_ACCEPT} showLabel={false} showDescription
      />
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

// Local 'YYYY-MM-DD' for an <input type="date"> default (today, in the operator's timezone).
function todayLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function SessionLogger({ enrollmentId, onLogged }: { enrollmentId: string; onLogged: () => void }) {
  const [notes, setNotes] = useState('');
  const [nextActions, setNextActions] = useState('');
  const [coachActions, setCoachActions] = useState('');
  const [sessionDate, setSessionDate] = useState(todayLocal());
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    // Send the chosen date as an ISO datetime; if cleared, omit it so the API keeps now().
    const body: Record<string, unknown> = { notes, nextActions, coachActions };
    if (sessionDate) body.sessionDate = new Date(sessionDate).toISOString();
    await fetch(`/api/enrollments/${enrollmentId}/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setNotes(''); setNextActions(''); setCoachActions(''); setSessionDate(todayLocal()); setSaving(false);
    onLogged();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="font-label text-xs text-plum">Log a session</h3>
      <div>
        <label className={INPUT_LABEL}>Session date</label>
        <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)}
          className="border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
      </div>
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

// Recordings = session Zoom calls → video only (DS-10).
const RECORDING_ACCEPT = '.mp4,.mov,.webm';
// Resources = delivered assets → video/audio/pdf. The R2 media_type CHECK only allows
// audio|video|pdf, so MP4/MOV → video, MP3/WAV/M4A → audio, PDF → pdf.
const RESOURCE_ACCEPT = '.mp3,.wav,.m4a,.mp4,.mov,.pdf';

function recordingMediaType(file: File): 'audio' | 'video' | 'pdf' {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov')) return 'video';
  return 'audio';
}

function recordingContentType(file: File): string {
  if (file.name.toLowerCase().endsWith('.m4a')) return 'audio/x-m4a';
  if (file.name.toLowerCase().endsWith('.mov')) return 'video/quicktime';
  return file.type || 'application/octet-stream';
}

// Shared client-content uploader. Renders a Recordings (kind='recording', video-only) or a
// Resources (kind='file', video/audio/pdf, with a description) section depending on props.
// Both post to the same /api/enrollments/[id]/recordings endpoint with the relevant `kind`.
function ClientContentSection({
  enrollmentId, items, onChange, kind, heading, accept, showLabel, showDescription,
}: {
  enrollmentId: string;
  items: Recording[];
  onChange: () => void;
  kind: 'recording' | 'file';
  heading: string;
  accept: string;
  showLabel: boolean;
  showDescription: boolean;
}) {
  const noun = kind === 'file' ? 'resource' : 'recording';
  // 'upload' (pick a file from disk) is the default; 'url' keeps the paste-an-R2-link fallback.
  const [showAdd, setShowAdd] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function r2KeyFromUrl(u: string): string {
    try { return new URL(u).pathname.replace(/^\//, ''); } catch { return ''; }
  }

  function reset() {
    setTitle(''); setFile(null); setUrl(''); setLabel(''); setDescription('');
    setShowAdd(false); setProgress(null); setError(null);
  }

  // POST the metadata to the attach endpoint (mode b — creates a private client_id row with
  // downloadable=true), tagged with this section's `kind`. Shared by upload and URL paths.
  async function attachItem(args: { publicUrl: string; r2Key: string; mediaType: string }) {
    const res = await fetch(`/api/enrollments/${enrollmentId}/recordings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, sessionLabel: label || null, kind,
        description: showDescription ? description : '',
        ...args,
      }),
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
        // Recordings are video-only; reject non-video early so a wrong file can't be tagged as a recording.
        if (kind === 'recording' && recordingMediaType(file) !== 'video') {
          throw new Error('Recordings must be a video file');
        }
        const mediaType = recordingMediaType(file);
        // Step 1: presign. Step 2: PUT the file straight to R2 (reuses the library upload flow).
        setProgress('Getting upload URL…');
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: recordingContentType(file), mediaType }),
        });
        if (!presignRes.ok) throw new Error('Failed to get upload URL');
        const presign = await presignRes.json();

        setProgress('Uploading…');
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT', body: file, headers: { 'Content-Type': recordingContentType(file) },
        });
        if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

        setProgress('Saving…');
        await attachItem({ publicUrl: presign.publicUrl, r2Key: presign.r2Key, mediaType });
      } else {
        const mediaType = /\.(mp4|mov|webm)$/i.test(url) ? 'video' : /\.pdf$/i.test(url) ? 'pdf' : 'audio';
        if (kind === 'recording' && mediaType !== 'video') {
          throw new Error('Recordings must be a video file');
        }
        await attachItem({ publicUrl: url, r2Key: r2KeyFromUrl(url), mediaType });
      }
      reset();
      onChange();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  async function remove(id: string) {
    setDeletingId(id); setError(null);
    try {
      const res = await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      onChange();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setDeletingId(null);
    }
  }

  const canSubmit = !!title && (mode === 'upload' ? !!file : !!url);

  return (
    <div className="border-t border-gold/10 pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-label text-xs text-plum">{heading} ({items.length})</h3>
        <button onClick={() => (showAdd ? reset() : setShowAdd(true))} className="btn-spark-outline text-xs px-3 py-1.5">
          {showAdd ? 'Cancel' : `Add ${noun}`}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-2 mb-3">
          {items.map((r) => (
            <div key={r.id} className="flex items-center justify-between border border-gold/20 rounded-lg p-2.5">
              <div className="min-w-0">
                <p className="text-sm text-slate truncate">{r.title}</p>
                {r.session_label && <p className="text-xs text-slate/60">{r.session_label}</p>}
                {showDescription && r.description && <p className="text-xs text-slate/60 truncate">{r.description}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <a href={r.public_url} target="_blank" rel="noreferrer" className="text-xs text-slate/60 hover:text-slate">Open</a>
                <button type="button" onClick={() => remove(r.id)} disabled={deletingId === r.id}
                  className="text-xs text-scarlet/70 hover:text-scarlet disabled:opacity-50">
                  {deletingId === r.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <form onSubmit={submit} className="space-y-2 bg-petal/40 rounded-lg p-3">
          {/* Mode toggle: upload a file (default) or paste an existing R2 link. */}
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
              <input type="file" accept={accept} disabled={saving}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-plum file:text-gold hover:file:bg-plum/90" />
              {file && (
                <p className="text-xs text-slate/60 mt-1">
                  {file.name} · {recordingMediaType(file)} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
          ) : (
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="R2 file URL (https://…)" required disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          )}

          {showLabel && (
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Session label (optional, e.g. Session 1)" disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          )}
          {showDescription && (
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Description (optional — shown to the client)" disabled={saving}
              className="w-full border border-slate/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none" />
          )}
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
