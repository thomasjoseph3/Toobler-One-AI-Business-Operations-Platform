import type { ConversationDetail, ConversationMessage } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import type { Principal } from '../../../../kernel/http/guard';
import { findPeopleSummaries } from '../../auth';
import * as conversationsRepository from '../repositories/conversations.repository';
import { isHeldNow, type ConversationRow } from '../repositories/conversations.repository';
import { readConversationDetail, refuseOwnLeadsOnlyRole } from './conversation-reader.service';
import { writeMessageAndAnnounce } from './conversation-records.service';

/** How long a person's hold lasts after taking over or after their last reply: two hours, then the conversation goes back to the AI. */
export const HOLD_HOURS = 2;
const HOLD_MILLISECONDS = HOLD_HOURS * 60 * 60 * 1000;

type Asker = Pick<Principal, 'accountId' | 'userId' | 'role'>;

/** Reads the conversation under its row lock (so takeovers, replies and the AI's save take turns). 404 for a test chat, an unknown id or another business's. */
async function lockRealConversation(
  transaction: Db,
  accountId: string,
  conversationId: string,
): Promise<ConversationRow> {
  const conversation = await conversationsRepository.lockConversationById(transaction, accountId, conversationId);
  if (!conversation || conversation.isTest) throw notFound('That conversation');
  return conversation;
}

/**
 * Staff takeover, replies and done (F21). The routes call this.
 * Repositories used: conversations, conversation-messages (in ../repositories). Names of people come from the auth module's index.
 */
export function createConversationTakeoverService({ database }: { database: Database }) {
  /** Writes a line in the activity log for something a person did to a conversation (ids only, never words). */
  async function logAction(transaction: Db, asker: Asker, kind: string, conversationId: string): Promise<void> {
    await writeActivityLog(transaction, {
      accountId: asker.accountId,
      actor: { kind: 'user', id: asker.userId },
      kind,
      details: { recordType: 'conversation', recordId: conversationId },
    });
  }

  return {
    /**
     * "I'll handle this": the AI stops replying in this conversation and the person replies from the inbox. The hold lasts two hours (every
     * reply starts the two hours again). 409 `HELD_BY_SOMEONE_ELSE` naming the person when someone else holds it; taking over your own hold just
     * extends it; 409 `CONVERSATION_ENDED` for an ended conversation; 403 for the "own leads only" role; 404 for an unknown or another business's.
     */
    async takeOver(asker: Asker, conversationId: string): Promise<ConversationDetail> {
      refuseOwnLeadsOnlyRole(asker);
      const { accountId } = asker;
      const actor: Actor = { kind: 'user', id: asker.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const now = new Date();
        const conversation = await lockRealConversation(transaction, accountId, conversationId);
        if (conversation.endedAt !== null) {
          throw conflict('CONVERSATION_ENDED', 'This conversation has ended, so there is nothing to take over.');
        }
        if (isHeldNow(conversation, now) && conversation.heldByUserId !== asker.userId) {
          const [holder] = await findPeopleSummaries(transaction, {
            accountId,
            userIds: conversation.heldByUserId ? [conversation.heldByUserId] : [],
          });
          throw conflict(
            'HELD_BY_SOMEONE_ELSE',
            `${holder?.name ?? 'Someone else'} is already handling this conversation.`,
          );
        }
        const wasAlreadyMine = isHeldNow(conversation, now);
        await conversationsRepository.holdConversation(transaction, {
          accountId,
          conversationId,
          userId: asker.userId,
          until: new Date(now.getTime() + HOLD_MILLISECONDS),
          actor,
        });
        if (!wasAlreadyMine) {
          await publishEvent(transaction, { accountId, eventName: 'conversation.held', payload: { conversationId } });
          await logAction(transaction, asker, 'conversations.taken_over', conversationId);
        }
        return readConversationDetail(transaction, accountId, conversationId);
      });
    },

    /**
     * "Hand back to AI": the person who holds the conversation (or a manager) lets the AI answer again. 409 `NOT_HELD` when nobody holds it,
     * 409 `NOT_THE_HOLDER` for anyone else.
     */
    async handBack(asker: Asker, conversationId: string): Promise<ConversationDetail> {
      refuseOwnLeadsOnlyRole(asker);
      const { accountId } = asker;
      const actor: Actor = { kind: 'user', id: asker.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await lockRealConversation(transaction, accountId, conversationId);
        if (!isHeldNow(conversation, new Date())) {
          throw conflict('NOT_HELD', 'Nobody is handling this conversation, so the AI is already answering.');
        }
        if (conversation.heldByUserId !== asker.userId && asker.role !== 'manager') {
          throw conflict(
            'NOT_THE_HOLDER',
            'Only the person handling this conversation, or a manager, can hand it back.',
          );
        }
        await conversationsRepository.releaseConversationHold(transaction, { accountId, conversationId, actor });
        await publishEvent(transaction, { accountId, eventName: 'conversation.released', payload: { conversationId } });
        await logAction(transaction, asker, 'conversations.handed_back', conversationId);
        return readConversationDetail(transaction, accountId, conversationId);
      });
    },

    /**
     * Sends a person's reply to the customer on the channel they used, and keeps the hold for two more hours. Only the person who holds the
     * conversation can reply (409 `NOT_THE_HOLDER`, "Take over first"). Web chat is the only channel that exists so far: a reply on any other
     * channel is 409 `CHANNEL_CANNOT_REPLY_YET`. 409 `CONVERSATION_ENDED` for an ended conversation.
     */
    async reply(asker: Asker, conversationId: string, body: string): Promise<ConversationMessage> {
      refuseOwnLeadsOnlyRole(asker);
      const { accountId } = asker;
      const actor: Actor = { kind: 'user', id: asker.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const now = new Date();
        const conversation = await lockRealConversation(transaction, accountId, conversationId);
        if (conversation.endedAt !== null) {
          throw conflict('CONVERSATION_ENDED', 'This conversation has ended. You can no longer reply to it.');
        }
        if (!isHeldNow(conversation, now) || conversation.heldByUserId !== asker.userId) {
          throw conflict('NOT_THE_HOLDER', 'Take over this conversation first ("I\'ll handle this"), then reply.');
        }
        // The web chat window shows saved replies itself; every other channel will add its own sender with its own feature
        if (conversation.channel !== 'webchat') {
          throw conflict('CHANNEL_CANNOT_REPLY_YET', 'Replying on this channel is not connected yet.');
        }
        const messageId = uuidv7();
        await writeMessageAndAnnounce(transaction, conversation, {
          id: messageId,
          accountId,
          sender: 'staff',
          body,
          channelMessageId: null,
          byUserId: asker.userId,
        });
        await conversationsRepository.holdConversation(transaction, {
          accountId,
          conversationId,
          userId: asker.userId,
          until: new Date(now.getTime() + HOLD_MILLISECONDS),
          actor,
        });
        const detail = await readConversationDetail(transaction, accountId, conversationId);
        const saved = detail.messages.find((message) => message.id === messageId);
        if (!saved) throw new Error('The reply was saved but could not be read back.');
        return saved;
      });
    },

    /** Marks the conversation done (nobody needs to act) and ends any hold. A new customer message reopens it. */
    async markDone(asker: Asker, conversationId: string): Promise<ConversationDetail> {
      refuseOwnLeadsOnlyRole(asker);
      const { accountId } = asker;
      const actor: Actor = { kind: 'user', id: asker.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const conversation = await lockRealConversation(transaction, accountId, conversationId);
        if (conversation.doneAt === null) {
          await conversationsRepository.setConversationDoneAt(transaction, {
            accountId,
            conversationId,
            doneAt: new Date(),
            actor,
          });
          if (conversation.heldByUserId !== null) {
            await conversationsRepository.releaseConversationHold(transaction, { accountId, conversationId, actor });
          }
          await publishEvent(transaction, { accountId, eventName: 'conversation.done', payload: { conversationId } });
          await logAction(transaction, asker, 'conversations.marked_done', conversationId);
        }
        return readConversationDetail(transaction, accountId, conversationId);
      });
    },
  };
}
