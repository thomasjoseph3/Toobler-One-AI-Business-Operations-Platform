import type { LlmErrorKind } from './llm-types';

// Providers describe failures in free text. These readers turn that text into the few kinds the app acts on.
// Ported from the hotel agent (shared/model.js), with "model not found" added so a retired model is noticed.

/** The text of whatever was thrown, as one line. Never includes a key. */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** The provider says the key itself is no good (invalid, expired, revoked, API not enabled). */
export function isBadKeyError(error: unknown): boolean {
  return /API key (not valid|expired)|API_KEY_INVALID|invalid api key|incorrect api key|authentication|PERMISSION_DENIED|\b(401|403)\b/i.test(
    errorText(error),
  );
}

/** The provider says a quota is used up, we are going too fast, or it is overloaded right now (503 "high demand"). */
export function isRateLimitError(error: unknown): boolean {
  return /\b(429|503)\b|quota|rate.?limit|RESOURCE_EXHAUSTED|overloaded|high demand|too many requests|UNAVAILABLE/i.test(
    errorText(error),
  );
}

/** The provider does not know the model (retired, renamed or mistyped). */
export function isModelMissingError(error: unknown): boolean {
  return /\b404\b|model.{0,40}(not found|does not exist|not supported|no longer|decommission|deprecated)|NOT_FOUND/i.test(
    errorText(error),
  );
}

/** The call took too long and was stopped (see the time limit in langchain-provider.ts). */
export function isTimeoutError(error: unknown): boolean {
  return /timed? ?out|timeout|aborted/i.test(errorText(error));
}

/** True when a rate limit looks like the day's quota rather than a short burst limit. */
export function isDailyQuotaError(error: unknown): boolean {
  return /per.?day|daily/i.test(errorText(error));
}

/** Sorts a failure into one kind. Order matters: a bad key is checked before a rate limit, a missing model before both, a timeout last. */
export function readLlmError(error: unknown): LlmErrorKind {
  if (isBadKeyError(error)) return 'bad_key';
  if (isModelMissingError(error)) return 'model_missing';
  if (isRateLimitError(error)) return 'rate_limited';
  if (isTimeoutError(error)) return 'timed_out';
  return 'error';
}
