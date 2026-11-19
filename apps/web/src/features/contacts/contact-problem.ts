import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a refused or failed save of a contact. Never a code or a status number. */
export function describeContactSaveProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('contacts.form.error.network');
    if (error.status === 404) return t('contacts.form.error.gone');
    if (error.code === 'CONTACT_EXISTS') return t('contacts.form.error.exists');
    if (error.code === 'VALIDATION_ERROR') return error.message;
  }
  return t('contacts.form.error.unknown');
}
