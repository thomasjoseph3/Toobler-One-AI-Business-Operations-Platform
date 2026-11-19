import type { SenderCheck } from './mail-parsing';

// How the app reads and answers a business's own mailbox. The rest of the app only knows this shape; the real calls (IMAP to read, SMTP to
// send) are in imap-mailbox-provider.ts, and tests use a scripted one, so no test ever reaches a mail server.

/** What it takes to use one business's mailbox. The password is a secret: never log it. */
export interface MailboxAccess {
  /** The mailbox's address, which is also the "From" of replies, like enquiries@nairstays.example. */
  address: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

/** One email from a customer, ready for the AI. */
export interface IncomingEmail {
  /** The email's own id (`<...>`): the same email read twice has the same id. */
  messageId: string;
  inReplyTo: string | null;
  /** The ids of the earlier emails of the thread, oldest first. */
  references: string[];
  fromName: string | null;
  /** In lower case. */
  fromEmail: string;
  /** Whether our mail server's own check says the sender is who they claim to be. */
  senderCheck: SenderCheck;
  subject: string;
  receivedAt: Date;
  /** The new words only (quoted history cut off), at most 30,000 characters. */
  text: string;
}

export interface MailboxProvider {
  /** Signs in to the mailbox and opens the inbox without reading anything. Answers a plain sentence ("Read access works (12 emails in the inbox)"). Throws with the mail server's plain reason. */
  checkAccess(access: MailboxAccess): Promise<string>;
  /**
   * The customers' emails received since `since` that nobody has answered (not flagged answered, and no message in the Sent folder replies to
   * them), oldest first, at most 40 per call. Newsletters, notifications, bounces, the business's own mail and spam are left out. Read only:
   * nothing is moved, deleted or marked as read.
   */
  readNewEmails(access: MailboxAccess, options: { since: Date }): Promise<IncomingEmail[]>;
  /** Sends an email from the mailbox. `inReplyTo` and `references` keep the reply in the customer's thread. Answers the sent email's own id. */
  sendEmail(
    access: MailboxAccess,
    email: {
      to: string;
      subject: string;
      text: string;
      inReplyTo?: string | undefined;
      references?: string[] | undefined;
    },
  ): Promise<{ messageId: string | null }>;
}
