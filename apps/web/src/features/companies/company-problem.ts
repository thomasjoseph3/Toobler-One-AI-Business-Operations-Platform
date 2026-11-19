import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a refused or failed save of a company. Never a code or a status number. */
export function describeCompanySaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('companies.problem.network');
    if (error.status === 404) return t('companies.problem.gone');
    if (error.code === 'COMPANY_EXISTS') return t('companies.problem.nameExists');
    if (error.code === 'COMPANY_DOMAIN_EXISTS') return t('companies.problem.domainExists');
    if (error.code === 'FREE_MAIL_DOMAIN' || error.code === 'INVALID_PHONE' || error.code === 'VALIDATION_ERROR')
      return error.message;
  }
  return t('companies.problem.unknown');
}
