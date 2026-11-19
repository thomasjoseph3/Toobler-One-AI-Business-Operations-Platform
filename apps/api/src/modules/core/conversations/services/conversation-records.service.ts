import type { ConversationChannel } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { badRequest, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
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
        // A test chat is not a real conversation: the inbox and the live screens never hear about it
        if (!(input.isTest ?? false)) {
          await publishEvent(transaction, {
            accountId,
            eventName: 'conversation.started',
            payload: { conversationId },
          });
        }
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
     * A conversation's messages (customer and agent, oldest first) and whether it is a test chat, or undefined when the id is unknown or
     * another business's. The agent's summary job reads a conversation through this. Staff messages and system notes are left out: the
     * summary is about what the customer and the agent said.
     */
    async readMessagesForSummary(
      accountId: string,
      conversationId: string,
    ): Promise<
      | { isTest: boolean; channel: ConversationChannel; messages: Array<{ sender: MessageSender; body: string }> }
      | undefined
    > {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        if (!conversation) return undefined;
        const messages = await conversationMessagesRepository.listMessagesOfConversation(
          transaction,
          accountId,
          conversationId,
        );
        return {
          isTest: conversation.isTest,
          channel: conversation.channel,
          messages: messages
            .filter((message) => message.sender === 'customer' || message.sender === 'agent')
            .map((message) => ({ sender: message.sender, body: message.body })),
        };
      });
    },

    /**
     * A real (not test) chat of the given channel, or undefined when the id is unknown, another business's, a test chat, or from another
     * channel. Says whether the conversation has ended. A channel uses this to check that a visitor's token points at one of its own chats.
     */
    async findChat(
      accountId: string,
      conversationId: string,
      channel: ConversationChannel,
    ): Promise<{ id: string; ended: boolean } | undefined> {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        if (!conversation || conversation.isTest || conversation.channel !== channel) return undefined;
        return { id: conversation.id, ended: conversation.endedAt !== null };
      });
    },

    /** What the customer, the agent and the team said in a conversation, oldest first (system notes are left out). */
    async readChatMessages(
      accountId: string,
      conversationId: string,
    ): Promise<Array<{ sender: 'customer' | 'agent' | 'staff'; body: string; createdAt: Date }>> {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const messages = await conversationMessagesRepository.listMessagesOfConversation(
          transaction,
          accountId,
          conversationId,
        );
        const chatMessages: Array<{ sender: 'customer' | 'agent' | 'staff'; body: string; createdAt: Date }> = [];
        for (const message of messages) {
          if (message.sender === 'customer' || message.sender === 'agent' || message.sender === 'staff') {
            chatMessages.push({ sender: message.sender, body: message.body, createdAt: message.createdAt });
          }
        }
        return chatMessages;
      });
    },

    /**
     * Fills in the phone (digits only) and/or the email (lower case) of a chat whose visitor said them. Only an empty value is filled: a
     * phone or an email already linked is never replaced.
     */
    async linkVisitorContact(
      accountId: string,
      conversationId: string,
      contact: { phoneKey?: string | undefined; email?: string | undefined; actor?: Actor | undefined },
    ): Promise<void> {
      if (contact.phoneKey !== undefined && !/^[0-9]{5,20}$/.test(contact.phoneKey)) {
        throw badRequest('A phone number must be given as digits only (the form contacts use).');
      }
      if (contact.email !== undefined && contact.email !== contact.email.toLowerCase()) {
        throw badRequest('An email must be given in lower case.');
      }
      await database.runInAccountTransaction(accountId, async (transaction) => {
        await conversationsRepository.fillInVisitorContact(transaction, {
          accountId,
          conversationId,
          phoneKey: contact.phoneKey,
          email: contact.email,
          actor: contact.actor ?? ENGINE_ACTOR,
        });
      });
    },

    /** The id of the customer's open conversation on a channel (matched by their phone number), or undefined when they have none. */
    async findOpenChatOfPhone(
      accountId: string,
      channel: ConversationChannel,
      phoneKey: string,
    ): Promise<string | undefined> {
      return database.runInAccountTransaction(accountId, (transaction) =>
        conversationsRepository.findOpenConversationOfPhone(transaction, { accountId, channel, phoneKey }),
      );
    },

    /**
     * What a channel needs to send a staff member's reply to the customer: where the conversation is, who is on the other end, the words,
     * and when the customer last wrote (WhatsApp allows free text only for 24 hours after that). Undefined when the message is unknown,
     * another business's, a test chat, or not a staff message.
     */
    async readStaffMessageForDelivery(
      accountId: string,
      conversationId: string,
      messageId: string,
    ): Promise<
      | {
          channel: ConversationChannel;
          fromPhoneKey: string | null;
          fromEmail: string | null;
          body: string;
          lastCustomerMessageAt: Date | null;
        }
      | undefined
    > {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        if (!conversation || conversation.isTest) return undefined;
        const messages = await conversationMessagesRepository.listMessagesOfConversation(
          transaction,
          accountId,
          conversationId,
        );
        const staffMessage = messages.find((message) => message.id === messageId && message.sender === 'staff');
        if (!staffMessage) return undefined;
        const customerMessages = messages.filter((message) => message.sender === 'customer');
        const lastCustomerMessage = customerMessages[customerMessages.length - 1];
        return {
          channel: conversation.channel,
          fromPhoneKey: conversation.fromPhoneKey,
          fromEmail: conversation.fromEmail,
          body: staffMessage.body,
          lastCustomerMessageAt: lastCustomerMessage ? lastCustomerMessage.createdAt : null,
        };
      });
    },

    /** The businesses that have a real chat of the channel gone quiet since `idleSince` (ids only). For a scheduled job with no business. */
    async listAccountsWithIdleChats(channel: ConversationChannel, idleSince: Date): Promise<string[]> {
      return conversationsRepository.listAccountIdsWithIdleChats(database.system, { channel, idleSince });
    },

    /** The ids of the business's real chats of the channel gone quiet since `idleSince`, oldest first (at most `limit`). */
    async listIdleChats(
      accountId: string,
      channel: ConversationChannel,
      idleSince: Date,
      limit: number,
    ): Promise<string[]> {
      return database.runInAccountTransaction(accountId, (transaction) =>
        conversationsRepository.listIdleChatIds(transaction, { accountId, channel, idleSince, limit }),
      );
    },

    /** Notes that a conversation has ended (only the first time: one that already ended keeps its time). Ending also ends any hold on it. */
    async markEnded(accountId: string, conversationId: string): Promise<void> {
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        const wasEnded = await conversationsRepository.markConversationEnded(transaction, {
          accountId,
          conversationId,
          endedAt: new Date(),
          actor: ENGINE_ACTOR,
        });
        if (wasEnded && conversation && !conversation.isTest) {
          await publishEvent(transaction, { accountId, eventName: 'conversation.ended', payload: { conversationId } });
        }
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
        return writeMessageAndAnnounce(transaction, conversation, {
          accountId,
          sender: input.sender,
          body,
          channelMessageId: input.channelMessageId ?? null,
        });
      });
    },

    /**
     * Saves one customer message and, unless a person holds the conversation, the agent's reply to it: the customer's message is always
     * saved; the reply only when nobody holds the conversation. The check and the saving happen under the conversation's row lock, so a
     * person who takes the conversation over while the AI is thinking wins: the AI's reply is thrown away. Answers whether the reply was
     * saved (false means a person holds the conversation and the AI must stay silent).
     */
    async saveCustomerMessageAndAgentReply(
      accountId: string,
      conversationId: string,
      input: { customerBody: string; agentBody: string },
    ): Promise<{ agentReplySaved: boolean }> {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.lockConversationById(transaction, accountId, conversationId);
        if (!conversation) throw notFound('That conversation');
        // Both messages are saved in one transaction, so they would share a time and could sort the wrong way round: the reply is one millisecond later
        const customerWrittenAt = new Date();
        await writeMessageAndAnnounce(transaction, conversation, {
          accountId,
          sender: 'customer',
          body: input.customerBody,
          channelMessageId: null,
          createdAt: customerWrittenAt,
        });
        if (conversationsRepository.isHeldNow(conversation, new Date())) return { agentReplySaved: false };
        await writeMessageAndAnnounce(transaction, conversation, {
          accountId,
          sender: 'agent',
          body: input.agentBody,
          channelMessageId: null,
          createdAt: new Date(customerWrittenAt.getTime() + 1),
        });
        return { agentReplySaved: true };
      });
    },

    /** Whether a person holds the conversation right now (false for an unknown conversation). The agent asks this before thinking. */
    async isHeldByPerson(accountId: string, conversationId: string): Promise<boolean> {
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await conversationsRepository.findConversationById(transaction, accountId, conversationId);
        return conversation !== undefined && conversationsRepository.isHeldNow(conversation, new Date());
      });
    },
  };
}

/**
 * Writes one message in the caller's transaction, tells the live screens (never for a test chat), and, when the CUSTOMER wrote, reopens a
 * conversation that staff had marked done. Answers whether the message was added (false for a repeat of a channel message).
 */
async function writeMessageAndAnnounce(
  transaction: Db,
  conversation: conversationsRepository.ConversationRow,
  message: {
    id?: string;
    accountId: string;
    sender: MessageSender;
    body: string;
    channelMessageId: string | null;
    byUserId?: string | null;
    createdAt?: Date;
  },
): Promise<boolean> {
  const messageId = message.id ?? uuidv7();
  const wasAdded = await conversationMessagesRepository.insertMessageIfNew(transaction, {
    id: messageId,
    accountId: message.accountId,
    conversationId: conversation.id,
    sender: message.sender,
    body: message.body,
    channelMessageId: message.channelMessageId,
    byUserId: message.byUserId ?? null,
    ...(message.createdAt ? { createdAt: message.createdAt } : {}),
  });
  if (!wasAdded || conversation.isTest) return wasAdded;
  if (message.sender === 'customer' && conversation.doneAt !== null) {
    await conversationsRepository.setConversationDoneAt(transaction, {
      accountId: message.accountId,
      conversationId: conversation.id,
      doneAt: null,
      actor: ENGINE_ACTOR,
    });
  }
  await publishEvent(transaction, {
    accountId: message.accountId,
    eventName: 'conversation.message',
    payload: { conversationId: conversation.id, sender: message.sender, messageId },
  });
  return wasAdded;
}

export { writeMessageAndAnnounce };
