import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a failed change. A refusal the API wrote in plain words (a website it cannot use, a number it cannot read) is shown as it is. */
export function describeChannelProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('channels.webchat.problem.network');
    if (error.status === 403) return t('channels.webchat.problem.forbidden');
    if (error.status === 400 && error.message && error.code !== 'UNKNOWN_ERROR') return error.message;
  }
  return t('channels.webchat.problem.generic');
}
