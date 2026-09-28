'use client';

import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

type StepName = 'client' | 'drive' | 'telegram' | 'routine' | 'notify_ready';
type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

interface Step {
  id: string;
  step: StepName;
  status: StepStatus;
  attempts: number;
  last_error: string | null;
  result: Record<string, unknown>;
  next_run_at: string;
}

interface IntakeEvent {
  id: string;
  ghl_contact_id: string | null;
  email: string | null;
  first_name: string;
  last_name: string;
  status: 'received' | 'processing' | 'complete' | 'failed' | 'invalid';
  error: string | null;
  client_id: string | null;
  client_name: string | null;
  drive_folder_id: string | null;
  notes_doc_id: string | null;
  telegram_invite_link: string | null;
  created_at: string;
  steps: Step[];
}

interface OpenAudio {
  id: string;
  client_id: string;
  client_name: string;
  title: string;
  r2_key: string | null;
  created_at: string;
}

interface Space {
  chat_id: string;
  status: 'available' | 'assigned';
  client_name: string | null;
}

interface AttentionData {
  events: IntakeEvent[];
  openAudios: OpenAudio[];
  pool: { available: number; total: number; lowThreshold: number; spaces: Space[] };
}

interface PickerClient { id: string; name: string; email: string }

// What each step is called on the checklist. "drafts" is the routine: it writes the intro
// email into Gmail and briefs into Drive.
const STEP_LABELS: Record<StepName, string> = {
  client: 'Member',
  drive: 'Folder',
  telegram: 'Telegram',
  routine: 'Drafts',
  notify_ready: 'Notified',
};

const STATUS_MARK: Record<StepStatus, { mark: string; cls: string; word: string }> = {
  done: { mark: '✓', cls: 'text-forest', word: 'done' },
  pending: { mark: '…', cls: 'text-slate/50', word: 'waiting' },
  running: { mark: '…', cls: 'text-slate/50', word: 'running' },
  failed: { mark: '✕', cls: 'text-red-600', word: 'failed' },
  blocked: { mark: '!', cls: 'text-scarlet', word: 'blocked' },
};

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function displayName(e: IntakeEvent): string {
  return e.client_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || 'Unknown';
}

function needsAttention(e: IntakeEvent): boolean {
  return e.status === 'failed' || e.status === 'invalid' || e.steps.some((s) => s.status === 'failed' || s.status === 'blocked');
}

export function AttentionView() {
  const [data, setData] = useState<AttentionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);

  const load = useCallback(() => {
    // State is only set once the fetch settles — never synchronously inside the effect.
    return fetch('/api/attention')
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load');
        setData(await res.json());
      })
      .catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while anything is still being set up, so a fresh intake fills in on its own.
  const inFlight = data?.events.some((e) => e.status === 'received' || e.status === 'processing') ?? false;
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [inFlight, load]);

  async function retry(step: Step) {
    setBusyStep(step.id); setError(null);
    try {
      const res = await fetch(`/api/attention/steps/${step.id}/retry`, { method: 'POST' });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? 'Retry failed');
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusyStep(null);
    }
  }

  const stuck = data?.events.filter(needsAttention) ?? [];
  const rest = data?.events.filter((e) => !needsAttention(e)) ?? [];

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-serif text-slate">Needs attention</h1>
          <p className="text-sm text-slate/70 mt-1">
            New coaching intakes and how their setup is going, custom audios in progress, and the
            Telegram group pool.
          </p>
        </div>

        {error && (
          <div className="bg-white rounded-2xl border border-red-200 p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!data && !error && (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          </div>
        )}

        {data && (
          <>
            {stuck.length > 0 && (
              <Section title={`Stuck (${stuck.length})`}>
                {stuck.map((e) => <EventCard key={e.id} event={e} onRetry={retry} busyStep={busyStep} />)}
              </Section>
            )}

            <CustomAudioPanel audios={data.openAudios} />

            <Section title="Recent intakes">
              {rest.length === 0 && stuck.length === 0 && (
                <p className="text-sm text-slate/60">No intakes yet.</p>
              )}
              {rest.map((e) => <EventCard key={e.id} event={e} onRetry={retry} busyStep={busyStep} />)}
            </Section>

            <PoolPanel pool={data.pool} onChange={load} />
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-label text-xs text-plum mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EventCard({
  event, onRetry, busyStep,
}: { event: IntakeEvent; onRetry: (s: Step) => void; busyStep: string | null }) {
  const routine = event.steps.find((s) => s.step === 'routine');
  const sessionUrl = routine?.result.sessionUrl as string | undefined;
  const drafted = routine?.status === 'done' && !routine.result.skipped;

  const links = [
    event.client_id && { label: 'Client', href: `/clients/${event.client_id}`, internal: true },
    event.drive_folder_id && { label: 'Drive folder', href: `https://drive.google.com/drive/folders/${event.drive_folder_id}` },
    event.notes_doc_id && { label: 'Notes doc', href: `https://docs.google.com/document/d/${event.notes_doc_id}/edit` },
    event.telegram_invite_link && { label: 'Telegram', href: event.telegram_invite_link },
    sessionUrl && { label: 'Routine session', href: sessionUrl },
  ].filter(Boolean) as { label: string; href: string; internal?: boolean }[];

  return (
    <div id={event.id} className="bg-white rounded-2xl border border-gold/20 p-5 scroll-mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate truncate">{displayName(event)}</p>
          <p className="text-xs text-slate/60 truncate">
            {event.email || 'no email'} · {fmtDateTime(event.created_at)}
          </p>
        </div>
        <span className="font-label text-[10px] uppercase text-slate/50 shrink-0">{event.status}</span>
      </div>

      {event.status === 'invalid' ? (
        <p className="text-sm text-red-600 mt-3">
          Couldn&apos;t process this intake: {event.error}. Fix the contact in GHL and re-send the webhook.
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {event.steps.map((s) => {
            const m = STATUS_MARK[s.status];
            const canRetry = s.status === 'failed' || s.status === 'blocked';
            return (
              <div key={s.id} className="flex items-start gap-2 text-sm">
                <span className={`w-4 text-center ${m.cls}`}>{m.mark}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-slate">{STEP_LABELS[s.step]}</span>
                  <span className="text-xs text-slate/50 ml-2">
                    {s.status === 'pending' && s.attempts > 0 ? `retrying at ${fmtDateTime(s.next_run_at)}` : m.word}
                    {s.step === 'routine' && s.result.skipped ? ' (routine not configured)' : ''}
                  </span>
                  {s.last_error && s.status !== 'done' && (
                    <p className="text-xs text-red-600/80 break-words">{s.last_error}</p>
                  )}
                </div>
                {canRetry && (
                  <button type="button" onClick={() => onRetry(s)} disabled={busyStep === s.id}
                    className="btn-spark-outline text-xs px-3 py-1 shrink-0 disabled:opacity-50">
                    {busyStep === s.id ? 'Retrying…' : 'Retry'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(links.length > 0 || drafted) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {links.map((l) =>
            l.internal ? (
              <Link key={l.label} href={l.href} className="text-xs text-plum underline underline-offset-2">{l.label}</Link>
            ) : (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer"
                className="text-xs text-plum underline underline-offset-2">{l.label}</a>
            ),
          )}
          {drafted && <span className="text-xs text-slate/60">Intro email draft is in Gmail.</span>}
        </div>
      )}
    </div>
  );
}

/** Start a delivery for anyone, plus the ones already started (CC-13). */
function CustomAudioPanel({ audios }: { audios: OpenAudio[] }) {
  const [clients, setClients] = useState<PickerClient[] | null>(null);
  const [query, setQuery] = useState('');

  async function loadClients() {
    if (clients) return;
    const res = await fetch('/api/clients/picker');
    if (res.ok) setClients((await res.json()).clients);
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !clients) return [];
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, query]);

  return (
    <Section title="Custom audio">
      <div className="bg-white rounded-2xl border border-gold/20 p-5">
        <label className="block text-xs font-medium tracking-wide text-slate/70 mb-1">
          Deliver custom audio — find the buyer
        </label>
        <input
          value={query}
          onFocus={loadClients}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or email"
          className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
        {matches.length > 0 && (
          <div className="mt-2 border border-gold/20 rounded-lg divide-y divide-gold/10">
            {matches.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}#custom-audio`}
                className="block px-3 py-2 text-sm text-slate hover:bg-petal">
                {c.name} <span className="text-xs text-slate/50">{c.email}</span>
              </Link>
            ))}
          </div>
        )}
        {query.trim() && clients && matches.length === 0 && (
          <p className="text-xs text-slate/60 mt-2">
            No one matches. If they bought on the site, import them on the Access page first.
          </p>
        )}

        {audios.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate/60">In progress</p>
            {audios.map((a) => (
              <Link key={a.id} href={`/clients/${a.client_id}#custom-audio`}
                className="flex items-center justify-between border border-gold/20 rounded-lg p-3 hover:bg-petal">
                <span className="text-sm text-slate truncate">{a.client_name} — {a.title}</span>
                <span className="text-xs text-slate/50 shrink-0">{a.r2_key ? 'file uploaded' : 'no file yet'}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

/** The pool of pre-made Telegram groups intake hands out (CC-5). */
function PoolPanel({ pool, onChange }: { pool: AttentionData['pool']; onChange: () => void }) {
  const [chatId, setChatId] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const low = pool.available <= pool.lowThreshold;

  async function register(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/telegram-spaces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Failed to register');
      setMsg({ ok: true, text: `Added ${out.title ?? out.chatId} to the pool.` });
      setChatId('');
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: String(err instanceof Error ? err.message : err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Telegram pool">
      <div className="bg-white rounded-2xl border border-gold/20 p-5">
        <p className={`text-sm ${low ? 'text-scarlet' : 'text-slate'}`}>
          {pool.available} of {pool.total} groups available{low ? ' — running low, make a few more.' : '.'}
        </p>
        <p className="text-xs text-slate/60 mt-1">
          To add one: create a private group in Telegram, add the bot as an admin with &ldquo;Change group
          info&rdquo; and &ldquo;Invite users&rdquo; on, then paste the group&apos;s chat id here.
        </p>
        <form onSubmit={register} className="mt-3 flex gap-2">
          <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" required
            className="flex-1 border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
          <button type="submit" disabled={saving} className="btn-spark text-xs px-3 py-1.5 disabled:opacity-50">
            {saving ? 'Checking…' : 'Add group'}
          </button>
        </form>
        {msg && <p className={`text-xs mt-2 ${msg.ok ? 'text-forest' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
    </Section>
  );
}
