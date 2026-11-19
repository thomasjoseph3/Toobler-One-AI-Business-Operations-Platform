import type { Database } from '../../../../kernel/database';
import { createConversationRecordsService } from '../../../core/conversations';
import { idleConversationCutoff } from '../helpers/idle-conversation-rule';
import * as whatsappConnectionRepository from '../repositories/whatsapp-connection.repository';

/** How many idle conversations of one business are ended in one run (the rest are taken the next time). */
const MOST_CONVERSATIONS_ENDED_PER_RUN = 50;

/** How long message ids are kept for spotting a repeated delivery. Meta retries for hours, not days. */
const RECEIPT_KEPT_DAYS = 7;

/**
 * Ends the WhatsApp conversations that have gone quiet. Two steps, so one slow business never holds up the others: first find which
 * businesses have idle conversations (a scheduled job with no business), then end each business's idle conversations in its own job.
 */
export function createIdleConversationsService(input: {
  database: Database;
  enqueueJob: (jobName: string, data: { accountId: string; conversationId: string }) => Promise<void>;
  now?: () => Date;
}) {
  const { database } = input;
  const now = input.now ?? (() => new Date());
  const conversationRecords = createConversationRecordsService({ database });

  return {
    /** The businesses that have idle WhatsApp conversations. */
    async findBusinessesWithIdleConversations(): Promise<string[]> {
      return conversationRecords.listAccountsWithIdleChats('whatsapp', idleConversationCutoff(now()));
    },

    /**
     * Ends one business's idle WhatsApp conversations: queues the sorting and the summary of each, then notes that it ended (the jobs are
     * queued first, so a failure leaves the conversation open and the next run tries again). Also forgets old message ids. Safe to run twice.
     * Answers how many it ended.
     */
    async endIdleConversationsOfBusiness(accountId: string): Promise<number> {
      const idleIds = await conversationRecords.listIdleChats(
        accountId,
        'whatsapp',
        idleConversationCutoff(now()),
        MOST_CONVERSATIONS_ENDED_PER_RUN,
      );
      for (const conversationId of idleIds) {
        await input.enqueueJob('conversations.sort_conversation', { accountId, conversationId });
        await input.enqueueJob('agents.summarise_conversation', { accountId, conversationId });
        await conversationRecords.markEnded(accountId, conversationId);
      }
      const forgetBefore = new Date(now().getTime() - RECEIPT_KEPT_DAYS * 24 * 60 * 60 * 1000);
      await database.runInAccountTransaction(accountId, (transaction) =>
        whatsappConnectionRepository.deleteReceiptsOlderThan(transaction, accountId, forgetBefore),
      );
      return idleIds.length;
    },
  };
}
