import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a refused or failed task save. Never a code or a status number. */
export function describeTaskSaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('tasks.form.error.network');
    if (error.status === 404) return t('tasks.form.error.gone');
    if (error.code === 'VALIDATION_ERROR') return error.message;
  }
  return t('tasks.form.error.unknown');
}
