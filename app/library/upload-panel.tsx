'use client';

import { useState, FormEvent } from 'react';
import { FilePicker } from '@/components/upload/FilePicker';
import { TagInput } from '@/components/upload/TagInput';
import { SuggestButton } from '@/components/upload/SuggestButton';

const MEDIA_TYPES = ['audio', 'video', 'pdf'] as const;
type MediaType = typeof MEDIA_TYPES[number];

const MODALITIES = ['Hypnosis', 'EFT', 'Tapping', 'Meditation', 'Other'] as const;

interface StepError {
  step: string;
  error: string;
}

interface UploadPanelProps {
  /**
   * Called with the new item's Neon id once it's saved. The Library view uses this
   * to refresh the list and select the new row, so the thing you just uploaded is
   * immediately in front of you — which is the whole reason upload lives here now
   * rather than on its own page.
   */
  onUploaded: (neonId: string) => void;
}

/**
 * Parse a response that is supposed to be JSON, and say something useful when it isn't.
 *
 * A gateway that times out or can't reach the app answers with an HTML error page, and
 * `res.json()` on that throws `Unexpected token '<'` — which tells the operator nothing
 * and looks like a bug in the upload rather than the request never arriving. The status
 * code is the part worth surfacing: 502/504 means the save may still have completed
 * server-side, which changes what you do next.
 */
async function readJson(res: Response, step: string) {
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    const gateway = res.status === 502 || res.status === 503 || res.status === 504;
    throw {
      step,
      error: gateway
        ? `The server didn't respond in time (HTTP ${res.status}). The item may still have been saved — check the library before retrying, to avoid a duplicate.`
        : `Expected JSON but got HTTP ${res.status}. First of the response: ${body.slice(0, 120)}`,
    };
  }
}

function getContentType(file: File): string {
  if (file.name.endsWith('.m4a')) return 'audio/x-m4a';
  return file.type || 'application/octet-stream';
}

function mediaTypeForFile(file: File): MediaType {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4')) return 'video';
  return 'audio';
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('audio');

  // Metadata fields (auto-filled for audio/video, manual for PDF)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [useCases, setUseCases] = useState('');
  const [modality, setModality] = useState('Meditation');
  const [moodTags, setMoodTags] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');

  // Stashed across analyze -> save
  const [r2Key, setR2Key] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);

  // Flow state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false); // fields are ready to review
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Just the title of the last saved item — the ids that used to be shown here are
  // all visible in the detail panel of the row this creates.
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [stepError, setStepError] = useState<StepError | null>(null);
  const [analyzeNote, setAnalyzeNote] = useState<string | null>(null);

  function onFileChange(f: File | null) {
    setFile(f);
    setAnalyzed(false);
    setSavedTitle(null);
    setStepError(null);
    setAnalyzeNote(null);
    setTranscript(null);
    setR2Key(null);
    setPublicUrl(null);
    if (f) setMediaType(mediaTypeForFile(f));
  }

  // Upload to R2 + transcribe + AI-analyze, then populate the form for review.
  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setStepError(null);
    setAnalyzeNote(null);
    setSavedTitle(null);

    try {
      // Step 1: presign
      setProgress('Getting upload URL…');
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: getContentType(file), mediaType }),
      });
      if (!presignRes.ok) throw { step: 'r2', error: 'Failed to get upload URL' };
      const presign = await presignRes.json();

      // Step 2: upload to R2
      setProgress('Uploading file to storage…');
      const r2Res = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': getContentType(file) },
      });
      if (!r2Res.ok) throw { step: 'r2', error: `R2 upload failed: ${r2Res.status}` };

      setR2Key(presign.r2Key);
      setPublicUrl(presign.publicUrl);

      // Step 3: transcribe + analyze
      setProgress('Transcribing & analyzing… (this can take a minute)');
      const analyzeRes = await fetch('/api/upload/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicUrl: presign.publicUrl, mediaType }),
      });
      const analyzeData = await readJson(analyzeRes, 'analyze');
      if (!analyzeData.ok) {
        throw { step: analyzeData.step ?? 'analyze', error: analyzeData.error ?? 'Analyze failed' };
      }

      // Populate the form for review
      setDescription(analyzeData.description ?? '');
      setMoodTags(analyzeData.moodTags ?? '');
      setUseCases(analyzeData.useCases ?? '');
      if (analyzeData.modality) setModality(analyzeData.modality);
      if (analyzeData.durationSeconds != null) {
        setDurationMinutes((analyzeData.durationSeconds / 60).toFixed(1));
      }
      setTranscript(analyzeData.transcript ?? null);
      // The upload worked but the AI couldn't fill the fields in. Not an error —
      // the form opens for manual entry — but say why rather than leaving it blank.
      setAnalyzeNote(analyzeData.analyzeNote ?? null);
      setAnalyzed(true);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'step' in err) setStepError(err as StepError);
      else setStepError({ step: 'unknown', error: String(err) });
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }

  // PDF path: upload to R2 now, then show the manual form (no transcript).
  async function handlePdfUpload() {
    if (!file) return;
    setAnalyzing(true);
    setStepError(null);
    setSavedTitle(null);
    try {
      setProgress('Getting upload URL…');
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: getContentType(file), mediaType: 'pdf' }),
      });
      if (!presignRes.ok) throw { step: 'r2', error: 'Failed to get upload URL' };
      const presign = await presignRes.json();

      setProgress('Uploading file to storage…');
      const r2Res = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': getContentType(file) },
      });
      if (!r2Res.ok) throw { step: 'r2', error: `R2 upload failed: ${r2Res.status}` };

      setR2Key(presign.r2Key);
      setPublicUrl(presign.publicUrl);
      setTranscript(null);
      setAnalyzed(true); // show the (empty) manual form
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'step' in err) setStepError(err as StepError);
      else setStepError({ step: 'unknown', error: String(err) });
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }

  // Save the reviewed fields: embed + Webflow + Neon.
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!r2Key || !publicUrl) return;
    setSaving(true);
    setStepError(null);

    try {
      setProgress('Saving to library…');
      const finalizeRes = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          r2Key,
          publicUrl,
          title,
          description,
          mediaType,
          useCases,
          modality,
          moodTags,
          durationSeconds: durationMinutes ? Math.round(parseFloat(durationMinutes) * 60) : null,
          transcript,
        }),
      });
      const finalizeData = await readJson(finalizeRes, 'finalize');
      if (!finalizeData.ok) {
        throw { step: finalizeData.step ?? 'finalize', error: finalizeData.error ?? 'Unknown error' };
      }
      // Collapse back to the dropzone and hand the new row to the Library view,
      // which refreshes the list and selects it.
      const savedFor = title;
      resetAll();
      setSavedTitle(savedFor);
      onUploaded(finalizeData.neonId);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'step' in err) setStepError(err as StepError);
      else setStepError({ step: 'unknown', error: String(err) });
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  function resetAll() {
    setFile(null);
    setMediaType('audio');
    setTitle('');
    setDescription('');
    setUseCases('');
    setModality('Meditation');
    setMoodTags('');
    setDurationMinutes('');
    setR2Key(null);
    setPublicUrl(null);
    setTranscript(null);
    setAnalyzed(false);
  }

  const busy = analyzing || saving;
  const isPdf = mediaType === 'pdf';

  return (
    <div className="mb-6">
      {savedTitle && (
        <div className="mb-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          Added <span className="font-medium">{savedTitle}</span> to the library.
        </div>
      )}

      {stepError && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
          <p className="font-medium text-red-800">Error at step: {stepError.step}</p>
          <p className="text-red-600 mt-1 font-mono text-xs">{stepError.error}</p>
        </div>
      )}

      {analyzeNote && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <p className="font-medium text-amber-900">Uploaded — fill the details in yourself</p>
          <p className="text-amber-700 mt-1">{analyzeNote}</p>
        </div>
      )}

      {/* Collapsed: just the dropzone. Expands into the review form after analyze,
          then collapses again once the item is saved. */}
      {!analyzed && (
        <div className="bg-white rounded-2xl shadow-sm border border-gold/20 p-5 space-y-4">
          <FilePicker value={file} onChange={onFileChange} disabled={busy} />

          {file && (
            <button
              type="button"
              onClick={isPdf ? handlePdfUpload : handleAnalyze}
              disabled={busy}
              className="btn-spark w-full disabled:opacity-50"
            >
              {busy
                ? 'Working…'
                : isPdf
                  ? 'Upload PDF & continue'
                  : 'Upload & analyze'}
            </button>
          )}

          {progress && (
            <p className="text-sm text-gold text-center animate-pulse">{progress}</p>
          )}
          {!isPdf && file && !busy && (
            <p className="text-xs text-slate/60 text-center">
              We&apos;ll transcribe the recording and pre-fill the details for you to review.
            </p>
          )}
        </div>
      )}

      {/* Expanded: review the auto-filled fields and save */}
      {analyzed && (
        <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm border border-gold/20 p-6 space-y-5">
            <div className="bg-petal/40 border border-gold/20 rounded-lg px-3 py-2 text-xs text-slate/60">
              {isPdf
                ? 'PDF uploaded. Fill in the details below.'
                : 'Transcribed and pre-filled from the recording — review and adjust, then save.'}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={busy}
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                placeholder="e.g. Morning Anxiety Release"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                disabled={busy}
                rows={3}
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none"
                placeholder="2-3 sentences describing the content and what it helps with"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate mb-1">Media Type</label>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as MediaType)}
                  disabled={busy}
                  className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  {MEDIA_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate mb-1">Modality</label>
                <select
                  value={modality}
                  onChange={(e) => setModality(e.target.value)}
                  disabled={busy}
                  className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  {MODALITIES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate mb-1">Duration (minutes)</label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                disabled={busy}
                min="0"
                step="0.5"
                className="w-full border border-slate/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                placeholder="e.g. 12.5"
              />
            </div>

            {/* PDFs have no transcript to suggest from — keep the title/description suggester */}
            {isPdf && (
              <SuggestButton
                title={title}
                description={description}
                onSuggest={(suggested_moodTags, suggested_useCases) => {
                  setMoodTags(suggested_moodTags);
                  setUseCases(suggested_useCases);
                }}
                disabled={busy}
              />
            )}

            <TagInput
              label="Mood Tags"
              value={moodTags}
              onChange={setMoodTags}
              placeholder="e.g. anxious, overwhelmed, grieving"
              disabled={busy}
            />

            <TagInput
              label="Use Cases"
              value={useCases}
              onChange={setUseCases}
              placeholder="e.g. grief, sleep, stress relief"
              disabled={busy}
            />

            {progress && (
              <p className="text-sm text-gold text-center animate-pulse">{progress}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetAll}
                disabled={busy}
                className="btn-spark-outline flex-1 disabled:opacity-50"
              >
                Start over
              </button>
              <button
                type="submit"
                disabled={busy || !title || !description}
                className="btn-spark flex-[2] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save to Library'}
              </button>
            </div>
        </form>
      )}
    </div>
  );
}
