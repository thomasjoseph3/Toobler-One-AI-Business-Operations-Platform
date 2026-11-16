import type { Database } from '../../../../kernel/database';
import { createConversationRecordsService } from '../../../core/conversations';
import { idleChatCutoff } from '../helpers/idle-chat-rule';
import { handOverChat } from './chat-hand-over.service';

/** How many idle chats of one business are ended in one run (the rest are taken a minute later). */
const MOST_CHATS_ENDED_PER_RUN = 50;

/**
 * Ends the web chats that have gone quiet for 15 minutes. Two steps, so one slow business never holds up the others: first find which
 * businesses have idle chats (a scheduled job with no business), then end each business's idle chats inside that business's own job.
 */
export function createIdleChatsService(input: {
  database: Database;
  enqueueJob: (jobName: string, data: { accountId: string; conversationId?: string }) => Promise<void>;
  now?: () => Date;
}) {
  const { database } = input;
  const now = input.now ?? (() => new Date());
  const conversationRecords = createConversationRecordsService({ database });

  return {
    /** The businesses that have idle web chats. */
    async findBusinessesWithIdleChats(): Promise<string[]> {
      return conversationRecords.listAccountsWithIdleChats('webchat', idleChatCutoff(now()));
    },

    /** Ends one business's idle web chats and hands each on. Safe to run twice: an ended chat is no longer idle. Answers how many it ended. */
    async endIdleChatsOfBusiness(accountId: string): Promise<number> {
      const idleChatIds = await conversationRecords.listIdleChats(
        accountId,
        'webchat',
        idleChatCutoff(now()),
        MOST_CHATS_ENDED_PER_RUN,
      );
      for (const conversationId of idleChatIds) {
        await handOverChat(
          {
            database,
            enqueueJob: (jobName, data) => input.enqueueJob(jobName, data),
          },
          accountId,
          conversationId,
        );
      }
      return idleChatIds.length;
    },
  };
}
