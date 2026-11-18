import type { AccountContext } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import { writeActivityLog } from '../../../../kernel/activity-log';
import * as companiesRepository from '../repositories/companies.repository';

/**
 * Reacts to "a person was removed from the team": the companies they looked after go to the person the manager chose. Safe to run more than once
 * for the same event: the second time they look after none.
 */
export async function handleTeamMemberRemoved(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const removedUserId = event.payload['userId'];
  const takeOverUserId = event.payload['handOverToUserId'];
  if (typeof removedUserId !== 'string' || typeof takeOverUserId !== 'string') return;
  const { accountId, actor } = accountContext;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const handedOver = await companiesRepository.handOverCompanies(transaction, {
      accountId,
      fromUserId: removedUserId,
      toUserId: takeOverUserId,
      actor,
    });
    if (handedOver > 0) {
      await writeActivityLog(transaction, {
        accountId,
        actor,
        kind: 'companies.handed_over',
        details: { recordType: 'user', recordId: removedUserId, fields: ['ownerUserId'] },
      });
    }
  });
}
