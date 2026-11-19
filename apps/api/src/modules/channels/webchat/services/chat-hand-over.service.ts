import type { Database } from '../../../../kernel/database';
import { createConversationRecordsService } from '../../../core/conversations';

/** What a chat's end needs: the database, and a way to queue the two jobs that follow it. */
interface HandOverDependencies {
  database: Database;
  enqueueJob: (jobName: string, data: { accountId: string; conversationId: string }) => Promise<void>;
}

/**
 * Ends a chat and hands it on: queues the sorting (type, lead or ticket) and the summary, then notes that it ended. The jobs are queued
 * first on purpose: if queueing fails the chat is still open and the next attempt tries again, and if noting the end fails the jobs are
 * safe to run anyway (the sorting notes the end itself, and both can run twice).
 */
export async function handOverChat(dependencies: HandOverDependencies, accountId: string, conversationId: string) {
  await dependencies.enqueueJob('conversations.sort_conversation', { accountId, conversationId });
  await dependencies.enqueueJob('agents.summarise_conversation', { accountId, conversationId });
  await createConversationRecordsService({ database: dependencies.database }).markEnded(accountId, conversationId);
}
