/**
 * How a setup step failed decides what the runner does next (see runner.ts).
 *
 *  - TransientError — worth trying again on its own (a 429, a 5xx, a network blip). Retried
 *    with backoff up to MAX_ATTEMPTS, then `failed`. Any error that isn't one of these three
 *    classes is treated as transient too.
 *  - BlockedError   — cannot succeed until a person does something (the Telegram pool is
 *    empty, an integration isn't configured). Parked as `blocked` straight away.
 *  - PermanentError — retrying would be wrong or pointless (a bad folder id, or a routine
 *    fire whose outcome is unknown). `failed` straight away; manual retry only.
 */
export class TransientError extends Error {
  constructor(message: string, public retryAt?: Date) {
    super(message);
    this.name = 'TransientError';
  }
}

export class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedError';
  }
}

export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

/** Blocked with a uniform message for an integration whose env vars are unset. */
export function notConfigured(...vars: string[]): BlockedError {
  return new BlockedError(`not configured: ${vars.join(', ')}`);
}
