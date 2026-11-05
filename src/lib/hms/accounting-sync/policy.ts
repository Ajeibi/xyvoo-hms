/** Retry rules for the outbound journal queue. Pure, so they can be tested without a database. */

export const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 60_000; // 1 minute
const MAX_DELAY_MS = 6 * 60 * 60_000; // 6 hours

/** Delay before the next try, after `attempts` failed tries (1 → 1 min, 2 → 2, 3 → 4 … capped at 6 h). */
export function backoffDelayMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (n - 1));
}

export type RetryDecision =
  | { status: "pending"; attempts: number; nextAttemptAt: string }
  | { status: "failed"; attempts: number; nextAttemptAt: null };

/** What to do with a row after a retryable failure. After MAX_ATTEMPTS it stops and waits for a manual retry. */
export function decideAfterFailure(previousAttempts: number, now: Date, retryAfterMs?: number | null): RetryDecision {
  const attempts = previousAttempts + 1;
  if (attempts >= MAX_ATTEMPTS) return { status: "failed", attempts, nextAttemptAt: null };
  const delay = Math.max(backoffDelayMs(attempts), retryAfterMs ?? 0);
  return { status: "pending", attempts, nextAttemptAt: new Date(now.getTime() + delay).toISOString() };
}

/** Parses a Retry-After header (seconds or an HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
