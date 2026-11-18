import type { ConversationChannel } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { createConversationRecordsService, type StartConversationInput } from '../../conversations';
import { EMPTY_AGENT_CONVERSATION_STATE } from '../helpers/agent-conversation-state';
import * as conversationFactsRepository from '../repositories/conversation-facts.repository';
import type { AgentTurnResult, createAgentRuntime } from './agent-runtime.service';

type AgentRuntime = ReturnType<typeof createAgentRuntime>;

/** How many messages of the conversation the agent is shown. Older ones are not sent (a summary of them arrives in a later slice). */
const MESSAGES_SHOWN_TO_THE_AGENT = 30;

/** What one saved turn needs. The business, the conversation and the channel come from the server, never from the customer's words. */
export interface SavedTurnInput {
  accountId: string;
  /** The conversation this message belongs to, or null to start a new one once the agent has answered. */
  conversationId: string | null;
  /** How to start the conversation when there is none yet (its channel, whether it is a test, who started it). */
  startConversation: StartConversationInput;
  /** What was said before (customer and agent only), oldest first. Empty for a new conversation. */
  earlierMessages: ReadonlyArray<{ sender: 'customer' | 'agent' | 'staff'; body: string }>;
  /** The customer's new message. */
  message: string;
  channel: ConversationChannel;
  /** What the channel says about itself, put into the agent's prompt. */
  channelNote?: string;
  /** Who is stamped on what is saved (the person testing, or the engine). */
  actor: Actor;
}

/**
 * What one saved turn gives back: the conversation it was saved in, and everything the agent returned. When a person holds the conversation
 * (staff takeover) the agent says nothing: `turn` is null, `heldByPerson` is true, and only the customer's message was saved.
 */
export type SavedTurnResult =
  | { conversationId: string; turn: AgentTurnResult; heldByPerson: false }
  | { conversationId: string; turn: null; heldByPerson: true };

/** What the agent is told a team member said, so it does not contradict a promise a person made. */
const TEAM_MEMBER_PREFIX = '[A team member of the business replied] ';

/**
 * One customer message, answered and written down: the agent answers, then the conversation (started if it is new), both messages and
 * what the agent learned are saved. Every channel and "Test the agent" use this, so a message is handled the same way everywhere. Nothing
 * is saved when the AI fails, so a failed message can simply be sent again.
 */
export function createAgentSavedTurnService(input: { database: Database; runtime: AgentRuntime }) {
  const { database, runtime } = input;
  const conversationRecords = createConversationRecordsService({ database });

  return {
    /** Answers the customer's message and saves the conversation. Throws when the agent could not answer (nothing is saved then). */
    async answerAndSave(turnInput: SavedTurnInput): Promise<SavedTurnResult> {
      const { accountId } = turnInput;
      // A person holds this conversation: the AI stays silent. The customer's message is saved and the team sees it.
      if (turnInput.conversationId && (await conversationRecords.isHeldByPerson(accountId, turnInput.conversationId))) {
        await conversationRecords.addMessage(accountId, turnInput.conversationId, {
          sender: 'customer',
          body: turnInput.message,
        });
        return { conversationId: turnInput.conversationId, turn: null, heldByPerson: true };
      }
      // What the agent remembers from earlier messages. A new conversation has nothing.
      const earlierState = turnInput.conversationId
        ? await database.runInAccountTransaction(accountId, (transaction) =>
            conversationFactsRepository.findConversationState(
              transaction,
              accountId,
              turnInput.conversationId as string,
            ),
          )
        : undefined;

      const turn = await runtime.runTurn({
        accountId,
        conversationId: turnInput.conversationId,
        channel: turnInput.channel,
        ...(turnInput.channelNote === undefined ? {} : { channelNote: turnInput.channelNote }),
        messages: [
          ...turnInput.earlierMessages.slice(-MESSAGES_SHOWN_TO_THE_AGENT).map((message) => ({
            role: message.sender === 'customer' ? ('user' as const) : ('assistant' as const),
            text: message.sender === 'staff' ? `${TEAM_MEMBER_PREFIX}${message.body}` : message.body,
          })),
          { role: 'user', text: turnInput.message },
        ],
        state: earlierState ?? EMPTY_AGENT_CONVERSATION_STATE,
      });

      // The AI answered: now the conversation, its two messages and what the agent learned are saved
      const conversationId =
        turnInput.conversationId ??
        (await conversationRecords.startConversation(accountId, turnInput.startConversation));
      // Saved under the conversation's lock: if a person took the conversation over while the AI was thinking, the reply is thrown away
      const { agentReplySaved } = await conversationRecords.saveCustomerMessageAndAgentReply(
        accountId,
        conversationId,
        {
          customerBody: turnInput.message,
          agentBody: turn.reply,
        },
      );
      if (!agentReplySaved) return { conversationId, turn: null, heldByPerson: true };
      await database.runInAccountTransaction(accountId, (transaction) =>
        conversationFactsRepository.saveConversationState(transaction, {
          accountId,
          conversationId,
          state: turn.state,
          promiseMadeAt: new Date(),
          actor: turnInput.actor,
        }),
      );
      return { conversationId, turn, heldByPerson: false };
    },
  };
}
