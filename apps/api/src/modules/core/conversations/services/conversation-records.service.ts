import type { ConversationChannel } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { badRequest, notFound } from '../../../../kernel/errors';
import { uuidv7 } from '../../../../kernel/ids';
import * as conversationMessagesRepository from '../repositories/conversation-messages.repository';
import type { MessageSender } from '../repositories/conversation-messages.repository';
import * as conversationsRepository from '../repositories/conversations.repository';

/** The actor stamped on what the channels and the engine do (no signed-in person is involved). */
const ENGINE_ACTOR: Actor = { kind: 'system', id: 'core.conversations' };

/** What a channel tells us when a conversation begins. */
export interface StartConversationInput {
  channel: ConversationChannel;
  /** Who is on the other end: a phone as digits only (the same form contacts use), and/or an email in lower case. Both may be absent. */
  fromPhoneKey?: string | undefined;
  fromEmail?: string | undefined;
  /** The contact, when the channel already knows who this is. */
  contactId?: string | undefined;
  /** True for a test chat ("Test the agent"): it is never sorted into a lead or a ticket. */
  isTest?: boolean | undefined;
  /** Who started it, when it is a person (a staff member testing the agent). Default: the engine. */
  actor?: Actor | undefined;
}

/** What a channel tells us about one message. */
export interface AddMessageInput {
  sender: MessageSender;
  body: string;
  /** The channel's own id for the message, so the same message arriving twice is stored once. */
  channelMessageId?: string | undefined;
}

/**
 * How the channels and the engine write down a conversation: start one, add its messages. These are called by code (a channel adapter or
 * the engine), never straight from a web request, so the business comes from the caller and nobody is signed in. The business's
 * database fence still applies.
 */
export function createConversationRecordsService({ database }: { database: Database }) {
  return {
    /** Starts a conversation for the business. It is open, with no type yet. Answers with its id. */
    async startConversation(accountId: string, input: StartConversationInput): Promise<string> {
      if (input.fromPhoneKey !== undefined && !/^[0-9]{5,20}$/.test(input.fromPhoneKey)) {
        throw badRequest('A phone number must be given as digits only (the form contacts use).');
      }
      if (input.fromEmail !== undefined && input.fromEmail !== input.fromEmail.toLowerCase()) {
        throw badRequest('An email must be given in lower case.');
      }
      const conversationId = uuidv7();
      await database.runInAccountTransaction(accountId, async (transaction) => {
        await conversationsRepository.insertConversation(transaction, {
          id: conversationId,
          accountId,
          channel: input.channel,
          fromPhoneKey: input.fromPhoneKey ?? null,
          fromEmail: input.fromEmail ?? null,
          contactId: input.contactId ?? null,
          isTest: input.isTest ?? false,
          actor: input.actor ?? ENGINE_ACTOR,
        });
      });
      return conversationId;
    },

    /**
     * The messages of a TEST chat, oldest first, or undefined when the id is unknown, another business's, or not a test chat. "Test the
     * agent" reads the history through this, so it can never read a real customer's conversation.
     */
    async readMessagesOfTestConversation(
      accountId: string,
      conversationId: string,
    ): Promise<Array<{ sender: MessageSender; body: string; createdAt: Date }> | undefined> {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        if (!conversation?.isTest) return undefined;
        return conversationMessagesRepository.listMessagesOfConversation(transaction, accountId, conversationId);
      });
    },

    /**
     * Adds a message to a conversation of the business. 404 when the conversation is unknown or another business's. A message whose
     * channel id is already stored for this conversation is ignored. Answers true when the message was added, false when it was a repeat.
     */
    async addMessage(accountId: string, conversationId: string, input: AddMessageInput): Promise<boolean> {
      const body = input.body.trim();
      if (body === '') throw badRequest('A message cannot be empty.');
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        if (!conversation) throw notFound('That conversation');
        return conversationMessagesRepository.insertMessageIfNew(transaction, {
          id: uuidv7(),
          accountId,
          conversationId,
          sender: input.sender,
          body,
          channelMessageId: input.channelMessageId ?? null,
        });
      });
    },
  };
}
