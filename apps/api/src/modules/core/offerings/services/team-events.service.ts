import type { AccountContext } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import { writeActivityLog } from '../../../../kernel/activity-log';
import * as offeringsRepository from '../repositories/offerings.repository';

/**
 * Reacts to "a person was removed from the team": the offerings they looked after are looked after by the person the manager chose, so new
 * leads about them are not shared out to someone who can no longer sign in. Safe to run more than once for the same event.
 */
export async function handleTeamMemberRemoved(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const removedUserId = event.payload['userId'];
  const takeOverUserId = event.payload['handOverToUserId'];
  if (typeof removedUserId !== 'string' || typeof takeOverUserId !== 'string') return;
  const { accountId, actor } = accountContext;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const handedOver = await offeringsRepository.handOverOfferings(transaction, {
      accountId,
      fromUserId: removedUserId,
      toUserId: takeOverUserId,
      actor,
    });
    if (handedOver > 0) {
      await writeActivityLog(transaction, {
        accountId,
        actor,
        kind: 'offerings.handed_over',
        details: { recordType: 'user', recordId: removedUserId, fields: ['ownerUserId'] },
      });
    }
  });
}
