import type { AccountContext } from '../../../../kernel/context';
import { publishEvent } from '../../../../kernel/events/publish';
import { listFieldsDueForPurge, markFieldValuesPurged } from '../repositories/field-definitions.repository';

/** How long the answers of a removed field are kept (hidden) before they are deleted for good. */
export const DAYS_REMOVED_ANSWERS_ARE_KEPT = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Starts the purge of one business's removed fields that were removed more than 30 days ago: for each one it announces "the answers of this field
 * must be deleted" (the contacts, companies and leads modules each delete them from their own records), then marks the field as purged. The
 * announcement and the mark are saved together, and deleting an answer twice does nothing, so running this twice is safe. Returns how many fields
 * were purged.
 */
export async function purgeRemovedFieldsForBusiness(accountContext: AccountContext, now: Date): Promise<number> {
  const { accountId } = accountContext;
  const removedBefore = new Date(now.getTime() - DAYS_REMOVED_ANSWERS_ARE_KEPT * MILLISECONDS_PER_DAY);
  return accountContext.runInAccountTransaction(async (transaction) => {
    const dueFields = await listFieldsDueForPurge(transaction, accountId, removedBefore);
    for (const field of dueFields) {
      await publishEvent(transaction, {
        accountId,
        eventName: 'field.values_purged',
        payload: { object: field.object, key: field.key },
      });
    }
    await markFieldValuesPurged(
      transaction,
      accountId,
      dueFields.map((field) => field.id),
      now,
    );
    return dueFields.length;
  });
}
