import type { AccountContext } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import { writeActivityLog } from '../../../../kernel/activity-log';
import * as tasksRepository from '../repositories/tasks.repository';

/**
 * Reacts to "a person was removed from the team": their open tasks go to the person the manager chose, so no reminder or late alert is left
 * pointing at someone who can no longer sign in. Safe to run more than once for the same event: the second time they own no open task.
 */
export async function handleTeamMemberRemoved(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const removedUserId = event.payload['userId'];
  const takeOverUserId = event.payload['handOverToUserId'];
  if (typeof removedUserId !== 'string' || typeof takeOverUserId !== 'string') return;
  const { accountId, actor } = accountContext;

  await accountContext.runInAccountTransaction(async (transaction) => {
    const handedOver = await tasksRepository.handOverOpenTasks(transaction, {
      accountId,
      fromUserId: removedUserId,
      toUserId: takeOverUserId,
      actor,
    });
    if (handedOver > 0) {
      await writeActivityLog(transaction, {
        accountId,
        actor,
        kind: 'tasks.handed_over',
        details: { recordType: 'user', recordId: removedUserId, fields: ['ownerUserId'] },
      });
    }
  });
}
