import { env } from './env';

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

// Poll settings: AssemblyAI is async. Cap total wait so a stuck job fails cleanly.
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200; // ~10 minutes

const headers = {
  Authorization: env.ASSEMBLYAI_API_KEY,
  'Content-Type': 'application/json',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TranscriptResult {
  text: string;
  durationSeconds: number | null;
}

/**
 * Transcribe an audio/video file that lives at a public URL (e.g. Cloudflare R2).
 * AssemblyAI accepts the remote URL directly and auto-extracts audio from video,
 * so no download/ffmpeg is needed. Returns the transcript text and audio duration.
 */
export async function transcribe(publicUrl: string): Promise<TranscriptResult> {
  // Step 1: submit the URL for transcription
  const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ audio_url: publicUrl }),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`AssemblyAI submit failed: ${submitRes.status} ${body}`);
  }

  const submitted = (await submitRes.json()) as { id?: string };
  const id = submitted.id;
  if (!id) throw new Error('AssemblyAI submit returned no transcript id');

  // Step 2: poll until completed or error
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${id}`, { headers });
    if (!pollRes.ok) {
      const body = await pollRes.text();
      throw new Error(`AssemblyAI poll failed: ${pollRes.status} ${body}`);
    }

    const data = (await pollRes.json()) as {
      status: string;
      text?: string;
      audio_duration?: number; // seconds, returned by AssemblyAI on completion
      error?: string;
    };

    if (data.status === 'completed') {
      return { text: data.text ?? '', durationSeconds: data.audio_duration ?? null };
    }
    if (data.status === 'error') {
      throw new Error(`AssemblyAI transcription error: ${data.error ?? 'unknown'}`);
    }
    // status is 'queued' or 'processing' — keep polling
  }

  throw new Error('AssemblyAI transcription timed out');
}
