import type { AccountContext } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import { writeActivityLog } from '../../../../kernel/activity-log';
import * as ticketsRepository from '../repositories/tickets.repository';

/**
 * Reacts to "a person was removed from the team": their open tickets go to the person the manager chose. Safe to run more than once for the
 * same event: the second time they own no open ticket.
 */
export async function handleTeamMemberRemoved(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const removedUserId = event.payload['userId'];
  const takeOverUserId = event.payload['handOverToUserId'];
  if (typeof removedUserId !== 'string' || typeof takeOverUserId !== 'string') return;
  const { accountId, actor } = accountContext;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const handedOver = await ticketsRepository.handOverOpenTickets(transaction, {
      accountId,
      fromUserId: removedUserId,
      toUserId: takeOverUserId,
      actor,
    });
    if (handedOver > 0) {
      await writeActivityLog(transaction, {
        accountId,
        actor,
        kind: 'tickets.handed_over',
        details: { recordType: 'user', recordId: removedUserId, fields: ['ownerUserId'] },
      });
    }
  });
}
