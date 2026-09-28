import { env } from './env';

/**
 * Fire the Claude Code routine (on Lindsay's account) that drafts a new client's intro
 * email and briefs (CC-6). The routine writes drafts only — Gmail drafts, Drive docs — and
 * never sends; Lindsay approves by sending.
 */

export class RoutineError extends Error {
  constructor(
    message: string,
    public status: number,
    /** From Retry-After, when the API gave one. */
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RoutineError';
  }
}

export function isRoutineConfigured(): boolean {
  return Boolean(env.CLAUDE_ROUTINE_ID && env.CLAUDE_ROUTINE_TOKEN);
}

export async function fireRoutine(text: string): Promise<{ sessionUrl: string | null; raw: unknown }> {
  const res = await fetch(
    `https://api.anthropic.com/v1/claude_code/routines/${env.CLAUDE_ROUTINE_ID}/fire`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLAUDE_ROUTINE_TOKEN}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const body = (await res.json().catch(() => null)) as
    | { claude_code_session_url?: string; error?: { message?: string } }
    | null;

  if (!res.ok) {
    throw new RoutineError(
      `Routine fire ${res.status}: ${body?.error?.message ?? 'no detail'}`,
      res.status,
      retryAfterMs(res.headers.get('retry-after')),
    );
  }
  return { sessionUrl: body?.claude_code_session_url ?? null, raw: body };
}

/** Retry-After is either seconds or an HTTP date. */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}
