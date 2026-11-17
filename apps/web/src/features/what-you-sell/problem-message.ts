import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** Codes whose own words are plain enough to show (the API wrote them for the person). */
const PLAIN_WORD_CODES: ReadonlySet<string> = new Set(['VALIDATION_ERROR', 'OFFERING_EXISTS', 'OFFERS_LIMIT', 'OFFERINGS_LIMIT', 'INVALID_DATE']);

/** One plain sentence for a failed change. Never a code or a status number. */
export function describeChangeProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('whatYouSell.problem.network');
    if (error.status === 403) return t('whatYouSell.problem.forbidden');
    if (error.status === 400 && PLAIN_WORD_CODES.has(error.code)) return error.message;
    if (error.status === 409) return error.message;
  }
  return t('whatYouSell.problem.generic');
}
