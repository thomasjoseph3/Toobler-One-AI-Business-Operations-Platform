import type { Database } from '../../../../kernel/database';
import { createConversationRecordsService } from '../../../core/conversations';
import { idleEmailCutoff } from '../helpers/idle-email-rule';

/** How many idle email conversations of one business are ended in one run (the rest are taken the next time). */
const MOST_CONVERSATIONS_ENDED_PER_RUN = 50;

/**
 * Ends the email conversations that have gone quiet, in two steps like the other channels: find which businesses have some (a scheduled job
 * with no business), then end each business's own in its own job.
 */
export function createIdleEmailConversationsService(input: {
  database: Database;
  enqueueJob: (jobName: string, data: { accountId: string; conversationId: string }) => Promise<void>;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const conversationRecords = createConversationRecordsService({ database: input.database });
  return {
    /** The businesses that have idle email conversations. */
    async findBusinessesWithIdleConversations(): Promise<string[]> {
      return conversationRecords.listAccountsWithIdleChats('email', idleEmailCutoff(now()));
    },

    /** Ends one business's idle email conversations: queues the sorting and the summary of each, then notes the end. Answers how many. */
    async endIdleConversationsOfBusiness(accountId: string): Promise<number> {
      const idleIds = await conversationRecords.listIdleChats(
        accountId,
        'email',
        idleEmailCutoff(now()),
        MOST_CONVERSATIONS_ENDED_PER_RUN,
      );
      for (const conversationId of idleIds) {
        await input.enqueueJob('conversations.sort_conversation', { accountId, conversationId });
        await input.enqueueJob('agents.summarise_conversation', { accountId, conversationId });
        await conversationRecords.markEnded(accountId, conversationId);
      }
      return idleIds.length;
    },
  };
}
