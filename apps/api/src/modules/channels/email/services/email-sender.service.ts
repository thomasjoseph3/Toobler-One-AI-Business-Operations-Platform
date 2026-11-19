import type { Database } from '../../../../kernel/database';
import type { MailboxAccess, MailboxProvider } from '../../../../providers/mailbox';
import { toPlainEmailText } from '../../../../providers/mailbox/mail-parsing';
import * as emailConnectionRepository from '../repositories/email-connection.repository';

/** One reply to send. */
export interface ReplyToSend {
  to: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
}

/**
 * Sends a reply from the business's mailbox, in the customer's thread. A failure is noted on the connection (so the Email screen shows it, in the
 * mail server's own words) and thrown again, so the caller can tell the person who pressed Send.
 */
export async function sendReplyFromMailbox(input: {
  database: Database;
  mailbox: MailboxProvider;
  accountId: string;
  access: MailboxAccess;
  reply: ReplyToSend;
}): Promise<void> {
  try {
    await input.mailbox.sendEmail(input.access, {
      to: input.reply.to,
      subject: input.reply.subject,
      text: toPlainEmailText(input.reply.text),
      ...(input.reply.inReplyTo ? { inReplyTo: input.reply.inReplyTo } : {}),
      ...(input.reply.references.length > 0 ? { references: input.reply.references } : {}),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The mail server refused the email';
    await input.database.runInAccountTransaction(input.accountId, (transaction) =>
      emailConnectionRepository.saveCheckResult(transaction, {
        accountId: input.accountId,
        status: 'failed',
        note: `A reply could not be sent: ${reason}`,
        checkedAt: new Date(),
      }),
    );
    throw error;
  }
}
