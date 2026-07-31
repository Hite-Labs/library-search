'use client';

import { useState, FormEvent } from 'react';
import { MediaBadge } from '@/components/MediaBadge';
import { MediaPlayer } from '@/components/MediaPlayer';
import { TagInput } from '@/components/upload/TagInput';
import type { LibraryItemDetail } from './library-view';

// Manrope input-label style (reserve Oswald/font-label for headers & subheaders).
const INPUT_LABEL = 'block text-xs font-medium tracking-wide text-slate/70 mb-1';

// Mirrors the upload form's list. The edit form also injects whatever the row
// currently holds, so legacy values outside this set survive a save untouched.
const MODALITIES = ['Hypnosis', 'EFT', 'Tapping', 'Meditation', 'Other'] as const;

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

function splitList(value: string): string[] {
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

interface LibraryDetailProps {
  item: LibraryItemDetail | null;
  loading: boolean;
  onSaved: (updated: LibraryItemDetail) => void;
}

export function LibraryDetail({ item, loading, onSaved }: LibraryDetailProps) {
  const [editing, setEditing] = useState(false);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gold/20 p-10 flex justify-center">
        <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="bg-white rounded-2xl border border-gold/20 p-10 text-center text-sm text-slate/60">
        Select an item to see its details.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gold/20 p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-serif text-slate break-words">{item.title}</h2>
          <p className="text-xs text-slate/60 mt-0.5">Added {fmtDate(item.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MediaBadge type={item.media_type} />
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn-spark-outline text-xs">
              Edit
            </button>
          )}
        </div>
      </div>

      <MediaPlayer mediaType={item.media_type} url={item.public_url} title={item.title} />

      {editing ? (
        <EditForm
          item={item}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            onSaved(updated);
            setEditing(false);
          }}
        />
      ) : (
        <ReadView item={item} />
      )}
    </div>
  );
}

function ReadView({ item }: { item: LibraryItemDetail }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const useCases = splitList(item.use_cases);
  const moodTags = splitList(item.mood_tags);

  return (
    <>
      <div className="border-t border-gold/10 pt-5 space-y-4">
        <Field label="Description">
          <p className="text-sm text-slate/80 whitespace-pre-wrap">{item.description || '—'}</p>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Modality">
            <p className="text-sm text-slate/80">{item.modality || '—'}</p>
          </Field>
          <Field label="Duration">
            <p className="text-sm text-slate/80">{fmtDuration(item.duration_seconds)}</p>
          </Field>
        </div>

        <Field label="Use cases">
          <Pills values={useCases} />
        </Field>
        <Field label="Mood tags">
          <Pills values={moodTags} />
        </Field>
      </div>

      {/* Transcript is collapsed by default — these run well past 10k characters,
          and the max-h below keeps an expanded one from stretching the page. */}
      <div className="border-t border-gold/10 pt-5">
        {item.transcript_length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setTranscriptOpen((o) => !o)}
              className="flex items-center justify-between w-full"
            >
              <h3 className="font-label text-xs text-plum">
                Transcript ({item.transcript_length.toLocaleString()} chars)
              </h3>
              <span className="text-xs text-slate/60">{transcriptOpen ? 'Hide' : 'Show'}</span>
            </button>
            {transcriptOpen && (
              <div className="mt-2 max-h-96 overflow-y-auto rounded-lg bg-petal/30 p-3 text-sm text-slate/80 whitespace-pre-wrap">
                {item.transcript}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate/50">No transcript.</p>
        )}
      </div>

      <div className="border-t border-gold/10 pt-5 space-y-3">
        <h3 className="font-label text-xs text-plum">Storage &amp; links</h3>
        <Field label="R2 key">
          <p className="text-xs font-mono text-slate/60 break-all">{item.r2_key}</p>
        </Field>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <a
            href={item.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate/60 hover:text-slate underline underline-offset-2"
          >
            Media URL
          </a>
          {item.content_page_url ? (
            <a
              href={item.content_page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate/60 hover:text-slate underline underline-offset-2"
            >
              Webflow page
            </a>
          ) : (
            <span className="text-slate/40">No content page URL</span>
          )}
          {!item.webflow_item_id && (
            <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              Not in Webflow CMS
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function EditForm({
  item,
  onCancel,
  onSaved,
}: {
  item: LibraryItemDetail;
  onCancel: () => void;
  onSaved: (updated: LibraryItemDetail) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [useCases, setUseCases] = useState(item.use_cases);
  const [moodTags, setMoodTags] = useState(item.mood_tags);
  const [modality, setModality] = useState(item.modality ?? '');
  const [durationMinutes, setDurationMinutes] = useState(
    item.duration_seconds ? (item.duration_seconds / 60).toFixed(1) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // A legacy row can hold a modality outside MODALITIES. Without this the select
  // would render the first option as selected and silently rewrite the value on save.
  const modalityOptions =
    modality && !MODALITIES.includes(modality as (typeof MODALITIES)[number])
      ? [modality, ...MODALITIES]
      : [...MODALITIES];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarning(null);

    // Send only what actually changed, so the PATCH stays genuinely partial and
    // Webflow isn't asked to re-resolve an option that didn't move.
    const patch: Record<string, unknown> = {};
    if (title !== item.title) patch.title = title;
    if (description !== item.description) patch.description = description;
    if (useCases !== item.use_cases) patch.useCases = useCases;
    if (moodTags !== item.mood_tags) patch.moodTags = moodTags;
    if (modality !== (item.modality ?? '')) patch.modality = modality || null;

    const nextDuration = durationMinutes ? Math.round(parseFloat(durationMinutes) * 60) : null;
    if (nextDuration !== item.duration_seconds) patch.durationSeconds = nextDuration;

    if (Object.keys(patch).length === 0) {
      setSaving(false);
      onCancel();
      return;
    }

    try {
      const res = await fetch(`/api/library/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `Save failed (${data.step ?? res.status})`);
      }
      // The save itself succeeded; a Webflow hiccup is a warning, not a failure.
      const warn = data.webflowWarning ?? data.publishWarning;
      if (warn) setWarning(warn);
      onSaved(data.item);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-gold/10 pt-5 space-y-4">
      <div>
        <label className={INPUT_LABEL}>Title</label>
        <input
          type="text" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={saving}
          className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>

      <div>
        <label className={INPUT_LABEL}>Description</label>
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={saving}
          className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-y"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={INPUT_LABEL}>Modality</label>
          <select
            value={modality} onChange={(e) => setModality(e.target.value)} disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold"
          >
            <option value="">None</option>
            {modalityOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={INPUT_LABEL}>Duration (minutes)</label>
          <input
            type="number" step="0.1" min="0" value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)} disabled={saving}
            className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>
      </div>

      <TagInput label="Use cases" value={useCases} onChange={setUseCases} disabled={saving} />
      <TagInput label="Mood tags" value={moodTags} onChange={setMoodTags} disabled={saving} />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {warning && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {warning} Press Edit → Save again to retry the Webflow sync.
        </p>
      )}

      <p className="text-xs text-slate/50">
        Saving re-runs the search embedding so search keeps matching what&apos;s shown here.
      </p>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className="btn-spark-outline flex-1 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={saving || !title} className="btn-spark flex-1 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={INPUT_LABEL}>{label}</p>
      {children}
    </div>
  );
}

function Pills({ values }: { values: string[] }) {
  if (values.length === 0) return <p className="text-sm text-slate/50">—</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span key={v} className="bg-petal text-plum text-xs px-2 py-0.5 rounded-full">
          {v}
        </span>
      ))}
    </div>
  );
}
