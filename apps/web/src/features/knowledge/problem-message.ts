import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

const PLAIN_WORD_CODES: ReadonlySet<string> = new Set([
  'INVALID_ANSWER',
  'INVALID_COUNTRY',
  'NOTHING_TO_CHANGE',
  'VALIDATION_ERROR',
  'PREFILL_ALREADY_RUNNING',
  'PREFILL_LIMIT_REACHED',
  'WEBSITE_NOT_PUBLIC',
  'WEBSITE_ADDRESS_INVALID',
  'LISTING_NOT_SUPPORTED',
  'GOOGLE_LISTING_NOT_SWITCHED_ON',
]);

/**
 * Turns a failed save into one plain sentence. When the API refused the answer itself (400), its own words say what to fix, so those
 * are shown; every other failure gets a general sentence that never shows a code or a status number.
 */
export function describeSaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('knowledge.problem.network');
    if (error.status === 403) return t('knowledge.problem.forbidden');
    // These refusals are written in plain words for the person, so their own words are shown
    if (PLAIN_WORD_CODES.has(error.code)) return error.message;
  }
  return t('knowledge.problem.unknown');
}
