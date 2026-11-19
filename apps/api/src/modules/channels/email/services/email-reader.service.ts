import type { FastifyBaseLogger } from 'fastify';
import type { Actor } from '../../../../kernel/context';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import { uuidv7 } from '../../../../kernel/ids';
import type { IncomingEmail, MailboxProvider } from '../../../../providers/mailbox';
import { replySubject } from '../../../../providers/mailbox/mail-parsing';
import type { createAgentSavedTurnService } from '../../../core/agents';
import { findBusinessLiveAt } from '../../../core/auth';
import { createConversationRecordsService } from '../../../core/conversations';
import { EMAIL_CHANNEL_NOTE, writeCustomerEmail } from '../helpers/email-words';
import * as emailConnectionRepository from '../repositories/email-connection.repository';
import { openMailboxAccess } from './mailbox-access.service';
import { sendReplyFromMailbox } from './email-sender.service';

type SavedTurnService = ReturnType<typeof createAgentSavedTurnService>;

/** What this module stamps on the conversations and messages it writes (no signed-in person is involved). */
const MODULE_ACTOR: Actor = { kind: 'system', id: 'channel.email' };

/** How long email receipts are kept for spotting an email read twice. */
const RECEIPT_KEPT_DAYS = 14;

/** What one reading of a mailbox did. */
export interface ReadResult {
  /** Emails the AI answered or drafted for. */
  answered: number;
  /** Emails saved but left for a person (the sender could not be checked, or a person holds the conversation). */
  leftForPerson: number;
  /** Emails already seen. */
  alreadySeen: number;
}

/**
 * Reads one business's mailbox and deals with each new customer email: it joins the customer's thread (found through the ids in the reply's
 * headers) or starts a conversation, the AI writes the reply, and the reply is sent or kept as a draft for a team member, as the business
 * chose. Newsletters and notifications never get here (the mailbox provider leaves them out). An email whose sender fails our mail server's
 * check is saved but NEVER answered. Safe to run twice: an email id seen before is skipped.
 */
export function createEmailReaderService(dependencies: {
  database: Database;
  config: Config;
  mailbox: MailboxProvider;
  savedTurns: SavedTurnService;
  logger: FastifyBaseLogger;
  now?: () => Date;
}) {
  const { database, config, mailbox, savedTurns, logger } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const conversationRecords = createConversationRecordsService({ database });

  /** Deals with one customer email. Answers what was done with it. */
  async function dealWithEmail(
    accountId: string,
    email: IncomingEmail,
    replyMode: 'send' | 'draft',
    access: Parameters<typeof sendReplyFromMailbox>[0]['access'],
  ): Promise<'answered' | 'left_for_person' | 'already_seen'> {
    const isFirstTime = await database.runInAccountTransaction(accountId, (transaction) =>
      emailConnectionRepository.claimEmailId(transaction, accountId, email.messageId),
    );
    if (!isFirstTime) return 'already_seen';

    const words = writeCustomerEmail(email.subject, email.text);
    // The customer's thread: the email this one answers, or any earlier one in its References
    const threadIds = [...(email.inReplyTo ? [email.inReplyTo] : []), ...[...email.references].reverse()];
    const existingConversationId =
      (await conversationRecords.findOpenChatByMessageIds(accountId, 'email', threadIds)) ?? null;

    // An email that cannot be proven to come from who it says is saved for the team but never answered by the AI
    if (email.senderCheck === 'fail') {
      const conversationId =
        existingConversationId ??
        (await conversationRecords.startConversation(accountId, {
          channel: 'email',
          fromEmail: email.fromEmail,
          actor: MODULE_ACTOR,
        }));
      await conversationRecords.addMessage(accountId, conversationId, {
        sender: 'customer',
        body: words,
        channelMessageId: email.messageId,
      });
      return 'left_for_person';
    }

    const earlierMessages = existingConversationId
      ? await conversationRecords.readChatMessages(accountId, existingConversationId)
      : [];
    const saved = await savedTurns.answerAndSave({
      accountId,
      conversationId: existingConversationId,
      startConversation: { channel: 'email', fromEmail: email.fromEmail, actor: MODULE_ACTOR },
      earlierMessages: earlierMessages.map((earlier) => ({ sender: earlier.sender, body: earlier.body })),
      message: words,
      customerChannelMessageId: email.messageId,
      channel: 'email',
      channelNote: EMAIL_CHANNEL_NOTE,
      actor: MODULE_ACTOR,
    });
    // A person holds the conversation: the AI says nothing and the person replies from the inbox
    if (saved.turn === null) return 'left_for_person';

    const reply = {
      to: email.fromEmail,
      subject: replySubject(email.subject),
      text: saved.turn.reply,
      inReplyTo: email.messageId,
      references: [...email.references, email.messageId],
    };
    if (replyMode === 'send') {
      await sendReplyFromMailbox({ database, mailbox, accountId, access, reply });
    } else {
      await database.runInAccountTransaction(accountId, (transaction) =>
        emailConnectionRepository.insertDraft(transaction, {
          id: uuidv7(),
          accountId,
          conversationId: saved.conversationId,
          toEmail: reply.to,
          subject: reply.subject,
          body: reply.text,
          inReplyTo: reply.inReplyTo,
          references: reply.references,
        }),
      );
    }
    return 'answered';
  }

  return {
    /**
     * Reads the mailbox once. Does nothing when no mailbox is connected, reading is paused, or the business has not gone live. When the
     * mailbox cannot be read the reason is kept on the connection (the Email screen shows it) and the next run tries again from the same point.
     */
    async readMailboxOfBusiness(accountId: string): Promise<ReadResult> {
      const result: ReadResult = { answered: 0, leftForPerson: 0, alreadySeen: 0 };
      const opened = await openMailboxAccess(database, config, accountId);
      if (!opened || !opened.connection.readEmails) return result;
      const liveAt = await database.runInAccountTransaction(accountId, (transaction) =>
        findBusinessLiveAt(transaction, accountId),
      );
      // A business that has not gone live does not answer customers (the setup wizard's "Go live")
      if (liveAt === null) return result;

      const startedAt = now();
      let emails: IncomingEmail[];
      try {
        emails = await mailbox.readNewEmails(opened.access, { since: opened.connection.checkedUpTo });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'The mailbox could not be read';
        logger.warn({ accountId, reason }, 'a mailbox could not be read');
        await database.runInAccountTransaction(accountId, (transaction) =>
          emailConnectionRepository.saveCheckResult(transaction, {
            accountId,
            status: 'failed',
            note: `The mailbox could not be read: ${reason}`,
            checkedAt: startedAt,
          }),
        );
        return result;
      }

      let newestEmailAt: Date | null = null;
      let everyEmailHandled = true;
      for (const email of emails) {
        try {
          const outcome = await dealWithEmail(accountId, email, opened.connection.replyMode, opened.access);
          if (outcome === 'answered') result.answered += 1;
          else if (outcome === 'left_for_person') result.leftForPerson += 1;
          else result.alreadySeen += 1;
          if (newestEmailAt === null || email.receivedAt > newestEmailAt) newestEmailAt = email.receivedAt;
        } catch (error) {
          // The AI could not answer (no key, over the budget) or the reply could not be sent: this email is tried again next time
          everyEmailHandled = false;
          if (!(error instanceof ApiError)) logger.error({ err: error, accountId }, 'an email could not be answered');
          // Forget that it was seen, so the next run tries it again
          await database.runInAccountTransaction(accountId, (transaction) =>
            emailConnectionRepository.forgetEmailId(transaction, accountId, email.messageId),
          );
        }
      }
      // Move the starting point on only when every email was dealt with, so none is skipped. A few minutes of overlap cover mail that
      // arrives while we read (already-seen emails are skipped by their ids).
      await database.runInAccountTransaction(accountId, async (transaction) => {
        await emailConnectionRepository.saveReadProgress(transaction, {
          accountId,
          checkedUpTo: everyEmailHandled ? new Date(startedAt.getTime() - 5 * 60_000) : opened.connection.checkedUpTo,
          lastEmailAt: newestEmailAt,
        });
        if (everyEmailHandled) {
          await emailConnectionRepository.saveCheckResult(transaction, {
            accountId,
            status: 'working',
            note: `Last read ${startedAt.toISOString()}`,
            checkedAt: startedAt,
          });
        }
        await emailConnectionRepository.deleteEmailReceiptsOlderThan(
          transaction,
          accountId,
          new Date(startedAt.getTime() - RECEIPT_KEPT_DAYS * 24 * 60 * 60 * 1000),
        );
      });
      return result;
    },
  };
}
