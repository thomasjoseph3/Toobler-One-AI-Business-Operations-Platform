import type {
  AgentTestChatDetail,
  AgentTestChatRequest,
  AgentTestChatResponse,
  AgentTestChatSummary,
} from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { badRequest, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { createConversationRecordsService, refuseOwnLeadsOnlyRole } from '../../conversations';
import { EMPTY_AGENT_CONVERSATION_STATE, type AgentConversationState } from '../helpers/agent-conversation-state';
import { describeAnswerSources } from '../helpers/describe-answer-sources';
import * as conversationFactsRepository from '../repositories/conversation-facts.repository';
import type { createAgentRuntime } from './agent-runtime.service';
import type { createConversationSummaryService } from './conversation-summary.service';

type AgentRuntime = ReturnType<typeof createAgentRuntime>;
type SummaryService = ReturnType<typeof createConversationSummaryService>;

/** How many messages of the conversation the agent is shown. Older ones are not sent (a summary of them arrives in a later slice). */
const MESSAGES_SHOWN_TO_THE_AGENT = 30;
/** A test chat longer than this is refused, so a test chat cannot grow without end (and cost without end). */
const MOST_MESSAGES_IN_A_TEST_CHAT = 200;

/** The promise as the API shows it (the time as text), or null when none was made. */
function describePromise(promise: AgentConversationState['promise']): AgentTestChatResponse['promise'] {
  if (!promise) return null;
  return { kind: promise.kind, sentence: promise.sentence, dueAt: promise.dueAt ? promise.dueAt.toISOString() : null };
}

/**
 * "Test the agent": a staff member chats as a pretend customer. The conversation is saved (marked as a test, so it never becomes a lead or
 * a ticket) together with what the agent learned and promised, and the answer says where the reply came from and what was saved.
 */
export function createAgentTestChatService(input: {
  database: Database;
  runtime: AgentRuntime;
  summaries: SummaryService;
}) {
  const { database, runtime, summaries } = input;
  const conversationRecords = createConversationRecordsService({ database });

  return {
    /**
     * Sends one pretend-customer message and answers with the agent's reply. Without a conversation id a new test chat is started; with one,
     * it carries on (404 when it is unknown, another business's, or not a test chat). Nothing is saved when the AI fails, so a failed
     * message can simply be sent again.
     */
    async sendTestMessage(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      request: AgentTestChatRequest,
    ): Promise<AgentTestChatResponse> {
      // A test chat is a saved conversation, so the role that may not read conversations may not use it either
      refuseOwnLeadsOnlyRole(principal);
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };

      // What was said before, and what the agent remembers. A new chat has neither.
      const earlierMessages = request.conversationId
        ? await conversationRecords.readMessagesOfTestConversation(accountId, request.conversationId)
        : [];
      if (earlierMessages === undefined) throw notFound('That test chat');
      if (earlierMessages.length >= MOST_MESSAGES_IN_A_TEST_CHAT) {
        throw badRequest('This test chat is long enough. Start a new one.');
      }
      const earlierState = request.conversationId
        ? await database.runInAccountTransaction(accountId, (transaction) =>
            conversationFactsRepository.findConversationState(transaction, accountId, request.conversationId as string),
          )
        : undefined;

      const turn = await runtime.runTurn({
        accountId,
        conversationId: request.conversationId ?? null,
        channel: 'webchat',
        messages: [
          ...earlierMessages
            .filter((message) => message.sender === 'customer' || message.sender === 'agent')
            .slice(-MESSAGES_SHOWN_TO_THE_AGENT)
            .map((message) => ({
              role: message.sender === 'customer' ? ('user' as const) : ('assistant' as const),
              text: message.body,
            })),
          { role: 'user', text: request.message },
        ],
        state: earlierState ?? EMPTY_AGENT_CONVERSATION_STATE,
      });

      // The AI answered: now the chat, its two messages and what the agent learned are saved
      const conversationId =
        request.conversationId ??
        (await conversationRecords.startConversation(accountId, { channel: 'webchat', isTest: true, actor }));
      await conversationRecords.addMessage(accountId, conversationId, { sender: 'customer', body: request.message });
      await conversationRecords.addMessage(accountId, conversationId, { sender: 'agent', body: turn.reply });
      await database.runInAccountTransaction(accountId, (transaction) =>
        conversationFactsRepository.saveConversationState(transaction, {
          accountId,
          conversationId,
          state: turn.state,
          promiseMadeAt: new Date(),
          actor,
        }),
      );

      return {
        conversationId,
        reply: turn.reply,
        answeredFrom: describeAnswerSources(turn.toolCalls),
        toolsCalled: turn.toolCalls.map((call) => ({ name: call.toolName, ok: call.ok, input: call.input })),
        detailsSaved: { ...turn.state.details },
        situation: turn.state.situation,
        promise: describePromise(turn.state.promise),
        heldBackAmounts: turn.heldBackAmounts,
      };
    },

    /**
     * Reads a saved test chat back: its messages, what the agent learned, the promise and the summary. 404 when the id is unknown, another
     * business's, or not a test chat (a real customer's conversation is never read here).
     */
    async readTestChat(
      principal: Pick<Principal, 'accountId' | 'role'>,
      conversationId: string,
    ): Promise<AgentTestChatDetail> {
      refuseOwnLeadsOnlyRole(principal);
      const { accountId } = principal;
      const messages = await conversationRecords.readMessagesOfTestConversation(accountId, conversationId);
      if (messages === undefined) throw notFound('That test chat');
      const { state, summary } = await database.runInAccountTransaction(accountId, async (transaction) => ({
        state:
          (await conversationFactsRepository.findConversationState(transaction, accountId, conversationId)) ??
          EMPTY_AGENT_CONVERSATION_STATE,
        summary: await conversationFactsRepository.findConversationSummary(transaction, accountId, conversationId),
      }));
      return {
        conversationId,
        messages: messages
          .filter((message) => message.sender === 'customer' || message.sender === 'agent')
          .map((message) => ({
            sender: message.sender === 'customer' ? ('customer' as const) : ('agent' as const),
            body: message.body,
            createdAt: message.createdAt.toISOString(),
          })),
        detailsSaved: { ...state.details },
        situation: state.situation,
        promise: describePromise(state.promise),
        summary: summary?.summary ?? null,
        summarisedAt: summary?.summarisedAt ? summary.summarisedAt.toISOString() : null,
      };
    },

    /**
     * Writes the summary of a test chat, the way the summary of a real conversation is written when it ends, so the owner can see what the
     * inbox would show. 404 for anything that is not a test chat of this business.
     */
    async summariseTestChat(
      principal: Pick<Principal, 'accountId' | 'role'>,
      conversationId: string,
    ): Promise<AgentTestChatSummary> {
      refuseOwnLeadsOnlyRole(principal);
      const messages = await conversationRecords.readMessagesOfTestConversation(principal.accountId, conversationId);
      if (messages === undefined) throw notFound('That test chat');
      const result = await summaries.summariseConversation(principal.accountId, conversationId);
      return {
        conversationId,
        summary: result.summary,
        summarisedAt: result.summarisedAt.toISOString(),
        writtenByAi: result.writtenByAi,
      };
    },
  };
}
