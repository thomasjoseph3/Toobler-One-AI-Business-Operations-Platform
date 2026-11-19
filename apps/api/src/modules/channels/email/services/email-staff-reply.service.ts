import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import type { MailboxProvider } from '../../../../providers/mailbox';
import { replySubject } from '../../../../providers/mailbox/mail-parsing';
import { createConversationRecordsService } from '../../../core/conversations';
import { readSubjectOfCustomerEmail } from '../helpers/email-words';
import { sendReplyFromMailbox } from './email-sender.service';
import { openMailboxAccess } from './mailbox-access.service';

/**
 * Sends a team member's reply (saved in the inbox) to the customer by email, in their thread. Runs when the "conversation.message" event for a
 * staff message arrives. The subject comes from the customer's first email; the reply answers their latest one. A failure is kept on the
 * connection (the Email screen shows it).
 */
export async function sendStaffReplyByEmail(input: {
  database: Database;
  config: Config;
  mailbox: MailboxProvider;
  accountId: string;
  conversationId: string;
  messageId: string;
  logger?: FastifyBaseLogger | undefined;
}): Promise<void> {
  const { database, config, mailbox, accountId } = input;
  const staffMessage = await createConversationRecordsService({ database }).readStaffMessageForDelivery(
    accountId,
    input.conversationId,
    input.messageId,
  );
  if (!staffMessage || staffMessage.channel !== 'email' || staffMessage.fromEmail === null) return;
  const opened = await openMailboxAccess(database, config, accountId);
  if (!opened) return;
  try {
    await sendReplyFromMailbox({
      database,
      mailbox,
      accountId,
      access: opened.access,
      reply: {
        to: staffMessage.fromEmail,
        subject: replySubject(readSubjectOfCustomerEmail(staffMessage.firstCustomerBody)),
        text: staffMessage.body,
        inReplyTo: staffMessage.lastCustomerChannelMessageId,
        references: staffMessage.lastCustomerChannelMessageId ? [staffMessage.lastCustomerChannelMessageId] : [],
      },
    });
  } catch (error) {
    // The reason is already kept on the connection by the sender
    input.logger?.warn({ accountId }, 'a staff reply could not be sent by email');
  }
}
