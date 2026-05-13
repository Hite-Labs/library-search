'use client';

import { useState, FormEvent } from 'react';
import { FilePicker } from '@/components/upload/FilePicker';
import { TagInput } from '@/components/upload/TagInput';
import { SuggestButton } from '@/components/upload/SuggestButton';

const MEDIA_TYPES = ['audio', 'video', 'pdf'] as const;
type MediaType = typeof MEDIA_TYPES[number];

const MODALITIES = ['Hypnosis', 'EFT', 'Tapping', 'Meditation', 'Other'] as const;

interface SuccessResult {
  neonId: string;
  webflowItemId: string;
  publicUrl: string;
}

interface StepError {
  step: string;
  error: string;
}

function getContentType(file: File): string {
  if (file.name.endsWith('.m4a')) return 'audio/x-m4a';
  return file.type || 'application/octet-stream';
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('audio');
  const [useCases, setUseCases] = useState('');
  const [modality, setModality] = useState('Meditation');
  const [moodTags, setMoodTags] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessResult | null>(null);
  const [stepError, setStepError] = useState<StepError | null>(null);

  // TODO: Program assignment field (commented out for future collections feature)
  // const [programId, setProgramId] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setSuccess(null);
    setStepError(null);

    try {
      // Step 1: Get presigned URL
      setUploadProgress('Getting upload URL…');
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: getContentType(file),
          mediaType,
        }),
      });
      if (!presignRes.ok) throw { step: 'r2', error: 'Failed to get upload URL' };
      const { uploadUrl, publicUrl, r2Key } = await presignRes.json();

      // Step 2: Upload to R2
      setUploadProgress('Uploading file to storage…');
      const r2Res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': getContentType(file) },
      });
      if (!r2Res.ok) throw { step: 'r2', error: `R2 upload failed: ${r2Res.status}` };

      // Step 3: Finalize
      setUploadProgress('Creating CMS record and storing embedding…');
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
        }),
      });
      const finalizeData = await finalizeRes.json();
      if (!finalizeData.ok) {
        throw { step: finalizeData.step ?? 'finalize', error: finalizeData.error ?? 'Unknown error' };
      }

      setSuccess({
        neonId: finalizeData.neonId,
        webflowItemId: finalizeData.webflowItemId,
        publicUrl: finalizeData.publicUrl,
      });
      resetForm();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'step' in err) {
        setStepError(err as StepError);
      } else {
        setStepError({ step: 'unknown', error: String(err) });
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  function resetForm() {
    setFile(null);
    setTitle('');
    setDescription('');
    setMediaType('audio');
    setUseCases('');
    setModality('Meditation');
    setMoodTags('');
    setDurationMinutes('');
  }

  const isDisabled = uploading;

  return (
    <div className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-stone-800">Upload Content</h1>
            <p className="text-sm text-stone-500 mt-0.5">Add a new item to the content library</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.reload();
            }}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            Sign out
          </button>
        </div>

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
            <p className="font-medium text-green-800 mb-2">Upload complete</p>
            <div className="space-y-1 text-green-700 font-mono text-xs">
              <p>R2 URL: <a href={success.publicUrl} target="_blank" rel="noreferrer" className="underline">{success.publicUrl}</a></p>
              <p>Webflow ID: {success.webflowItemId}</p>
              <p>Neon ID: {success.neonId}</p>
            </div>
          </div>
        )}

        {stepError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
            <p className="font-medium text-red-800">Error at step: {stepError.step}</p>
            <p className="text-red-600 mt-1 font-mono text-xs">{stepError.error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-5">
          <FilePicker value={file} onChange={setFile} disabled={isDisabled} />

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isDisabled}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="e.g. Morning Anxiety Release"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              disabled={isDisabled}
              rows={3}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
              placeholder="2-3 sentences describing the content and what it helps with"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Media Type</label>
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as MediaType)}
                disabled={isDisabled}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                {MEDIA_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Modality</label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value)}
                disabled={isDisabled}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              disabled={isDisabled}
              min="0"
              step="0.5"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="e.g. 12.5"
            />
          </div>

          <SuggestButton
            title={title}
            description={description}
            onSuggest={(suggested_moodTags, suggested_useCases) => {
              setMoodTags(suggested_moodTags);
              setUseCases(suggested_useCases);
            }}
            disabled={isDisabled}
          />

          <TagInput
            label="Mood Tags"
            value={moodTags}
            onChange={setMoodTags}
            placeholder="e.g. anxious, overwhelmed, grieving"
            disabled={isDisabled}
          />

          <TagInput
            label="Use Cases"
            value={useCases}
            onChange={setUseCases}
            placeholder="e.g. grief, sleep, stress relief"
            disabled={isDisabled}
          />

          {uploadProgress && (
            <p className="text-sm text-stone-500 text-center animate-pulse">{uploadProgress}</p>
          )}

          <button
            type="submit"
            disabled={isDisabled || !file || !title || !description}
            className="w-full bg-stone-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Uploading…' : 'Upload to Library'}
          </button>
        </form>
      </div>
    </div>
  );
}
