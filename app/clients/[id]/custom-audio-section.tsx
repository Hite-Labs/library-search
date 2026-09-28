'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { CopyLinkButton } from '@/components/CopyLinkButton';

interface CustomAudio {
  id: string;
  title: string;
  description: string;
  r2_key: string | null;
  media_type: 'audio' | 'video';
  status: 'in_progress' | 'delivered';
  delivered_at: string | null;
  created_at: string;
}

const INPUT_LABEL = 'block text-xs font-medium tracking-wide text-slate/70 mb-1';
const INPUT = 'w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold';
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? '';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Presign under this audio's per-client prefix, PUT the file straight to R2, then point the
 * row at it. The same browser-direct upload the rest of the dashboard uses; the server only
 * ever sees the key.
 */
async function uploadFile(audioId: string, file: File, onProgress: (s: string) => void) {
  const contentType = file.type || (/\.(mp4|mov|webm)$/i.test(file.name) ? 'video/mp4' : 'audio/mpeg');
  onProgress('Getting upload URL…');
  const presignRes = await fetch(`/api/custom-audios/${audioId}/upload-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType }),
  });
  const presign = await presignRes.json();
  if (!presignRes.ok) throw new Error(presign.error ?? 'Failed to get upload URL');

  onProgress('Uploading…');
  const put = await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

  onProgress('Saving…');
  const patch = await fetch(`/api/custom-audios/${audioId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ r2Key: presign.r2Key, mediaType: presign.mediaType }),
  });
  const out = await patch.json();
  if (!patch.ok) throw new Error(out.error ?? 'Failed to save the file');
}

/**
 * Custom audio for one person (CC-13): start a delivery, upload the recording, mark it
 * delivered — at which point it appears on their portal home. There is no email yet, so a
 * delivered audio offers a ready-to-send message for Lindsay to paste wherever she talks to
 * them.
 */
export function CustomAudioSection({ clientId, clientEmail }: { clientId: string; clientEmail: string }) {
  const [audios, setAudios] = useState<CustomAudio[] | null>(null);
  // Arriving from "Deliver custom audio" on /attention (…#custom-audio) opens the form.
  // This view only ever renders in the browser (the page waits on an auth fetch first), so
  // reading the hash in the initializer is safe.
  const [showAdd, setShowAdd] = useState(
    () => typeof window !== 'undefined' && window.location.hash === '#custom-audio',
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/clients/${clientId}/custom-audios`)
      .then(async (res) => {
        if (res.ok) setAudios((await res.json()).audios);
      })
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (window.location.hash === '#custom-audio') {
      document.getElementById('custom-audio')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy('new'); setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/custom-audios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Failed to create');
      if (file) await uploadFile(out.audio.id, file, setProgress);
      setTitle(''); setDescription(''); setFile(null); setShowAdd(false);
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      await load();
    } finally {
      setBusy(null); setProgress(null);
    }
  }

  async function replace(audio: CustomAudio, f: File) {
    setBusy(audio.id); setError(null);
    try {
      await uploadFile(audio.id, f, setProgress);
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null); setProgress(null);
    }
  }

  async function setStatus(audio: CustomAudio, status: CustomAudio['status']) {
    if (status === 'delivered' && !window.confirm(`Deliver "${audio.title}"? It appears on their portal straight away.`)) return;
    setBusy(audio.id); setError(null);
    try {
      const res = await fetch(`/api/custom-audios/${audio.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Failed to update');
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(audio: CustomAudio) {
    if (!window.confirm(`Delete "${audio.title}" and its file? They lose it from their portal.`)) return;
    setBusy(audio.id); setError(null);
    try {
      const res = await fetch(`/api/custom-audios/${audio.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Delete failed');
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  }

  const readyMessage = (a: CustomAudio) =>
    `Your custom audio "${a.title}" is ready! You'll find it on your portal home` +
    (PORTAL_URL ? `: ${PORTAL_URL}` : '.') +
    ` Log in with ${clientEmail}.`;

  return (
    <div id="custom-audio" className="mt-4 bg-white rounded-2xl border border-gold/20 p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-label text-xs text-plum">Custom audio</h2>
        {!showAdd && (
          <button type="button" onClick={() => setShowAdd(true)} className="btn-spark-outline text-xs px-3 py-1.5">
            Deliver custom audio
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {progress && <p className="text-xs text-slate/60 mb-3">{progress}</p>}

      {showAdd && (
        <form onSubmit={create} className="space-y-3 mb-4 border border-gold/20 rounded-lg p-4">
          <div>
            <label className={INPUT_LABEL}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200}
              placeholder="e.g. Confidence before your big talk" className={INPUT} />
          </div>
          <div>
            <label className={INPUT_LABEL}>Short description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000}
              className={`${INPUT} resize-none`} />
          </div>
          <div>
            <label className={INPUT_LABEL}>Recording (you can add it later)</label>
            <input type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy === 'new'} className="btn-spark text-xs px-3 py-1.5 disabled:opacity-50">
              {busy === 'new' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-spark-outline text-xs px-3 py-1.5">
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate/60">
            Saved as in progress. It only appears on their portal once you mark it delivered.
          </p>
        </form>
      )}

      {audios && audios.length === 0 && !showAdd && (
        <p className="text-sm text-slate/60">None yet.</p>
      )}

      <div className="space-y-2">
        {audios?.map((a) => (
          <div key={a.id} className="border border-gold/20 rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate truncate">{a.title}</p>
                <p className="text-xs text-slate/60">
                  {a.status === 'delivered' ? `Delivered ${fmtDate(a.delivered_at)}` : 'In progress'}
                  {!a.r2_key && ' · no file yet'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="btn-spark-outline text-xs px-3 py-1.5 cursor-pointer">
                  {a.r2_key ? 'Replace file' : 'Upload file'}
                  <input type="file" accept="audio/*,video/*" className="hidden" disabled={busy === a.id}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) replace(a, f); e.target.value = ''; }} />
                </label>
                {a.status === 'in_progress' ? (
                  <button type="button" onClick={() => setStatus(a, 'delivered')} disabled={busy === a.id || !a.r2_key}
                    className="btn-spark text-xs px-3 py-1.5 disabled:opacity-50">
                    Mark delivered
                  </button>
                ) : (
                  <button type="button" onClick={() => setStatus(a, 'in_progress')} disabled={busy === a.id}
                    className="btn-spark-outline text-xs px-3 py-1.5 disabled:opacity-50">
                    Unpublish
                  </button>
                )}
                <button type="button" onClick={() => remove(a)} disabled={busy === a.id}
                  className="text-xs text-slate/50 hover:text-red-600 disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>
            {a.status === 'delivered' && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-slate/70 flex-1">{readyMessage(a)}</p>
                <CopyLinkButton variant="text" label="Copy message" value={readyMessage(a)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
