import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';

/** One plain sentence for a refused or failed change to a ticket. Never a code or a status number. */
export function describeTicketChangeProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('tickets.form.error.network');
    if (error.status === 404) return t('ticketPage.error.gone');
    if (error.code === 'TICKET_CLOSED') return t('ticketPage.error.closed');
    if (error.code === 'VALIDATION_ERROR') return error.message;
  }
  return t('tickets.form.error.unknown');
}
