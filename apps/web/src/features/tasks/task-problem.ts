import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a refused or failed change to a task. Never a code or a status number. */
export function describeTaskChangeProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('tasks.form.error.network');
    if (error.status === 404) return t('tasks.problem.gone');
    if (error.status === 403) return t('tasks.problem.forbidden');
    if (error.code === 'VALIDATION_ERROR') return error.message;
  }
  return t('tasks.problem.generic');
}

/** One plain sentence for a refused or failed save of a new task (a 404 means the person or lead is gone). Never a code or a status number. */
export function describeTaskSaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('tasks.form.error.network');
    if (error.status === 404) return t('tasks.form.error.gone');
    if (error.code === 'VALIDATION_ERROR') return error.message;
  }
  return t('tasks.form.error.unknown');
}
