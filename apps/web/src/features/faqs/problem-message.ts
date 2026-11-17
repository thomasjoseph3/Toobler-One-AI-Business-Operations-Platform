import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a failed change. A refusal the API wrote in plain words (an FAQ that already exists, a question already dealt with) is shown as it is. */
export function describeFaqProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('faqs.problem.network');
    if ((error.status === 400 || error.status === 409) && error.message) return error.message;
  }
  return t('faqs.problem.generic');
}
