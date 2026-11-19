import type { AccountContext } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import * as companiesRepository from '../repositories/companies.repository';

/**
 * Reacts to "the answers of a removed custom field must be deleted for good" (the fields module's nightly purge): when the field was a company field,
 * its answer is taken out of every company of the business. Safe to run more than once for the same event: the second time nothing is left to delete.
 */
export async function handleFieldValuesPurged(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  if (event.payload['object'] !== 'company') return;
  const key = event.payload['key'];
  if (typeof key !== 'string') return;
  await accountContext.runInAccountTransaction(async (transaction) => {
    await companiesRepository.removeCustomAnswerKey(transaction, {
      accountId: accountContext.accountId,
      key,
      actor: accountContext.actor,
    });
  });
}
