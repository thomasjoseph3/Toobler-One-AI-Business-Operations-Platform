import type { Db } from '../../../../kernel/database';
import * as conversationMessagesRepository from '../repositories/conversation-messages.repository';

/**
 * Whether the business has tried its AI agent: a "Test the agent" chat in which the agent has answered at least once. The setup wizard
 * needs it before the business may go live. Runs in the business's own transaction.
 */
export async function hasTriedTheAgent(transaction: Db, accountId: string): Promise<boolean> {
  return conversationMessagesRepository.hasTestChatWithAgentReply(transaction, accountId);
}
