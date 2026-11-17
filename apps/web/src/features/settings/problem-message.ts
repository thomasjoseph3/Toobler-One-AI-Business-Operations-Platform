import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a failed change. A refusal the API wrote in plain words (a key already saved, a module that needs another) is shown as it is. */
export function describeSettingsProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('settings.ai.problem.network');
    if (error.status === 403) return t('settings.managersOnly');
    if (
      (error.status === 400 || error.status === 409 || error.status === 429) &&
      error.message &&
      error.code !== 'UNKNOWN_ERROR'
    )
      return error.message;
  }
  return t('settings.ai.problem.generic');
}
