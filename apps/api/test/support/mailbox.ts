import type { IncomingEmail, MailboxAccess, MailboxProvider } from '../../src/providers/mailbox';

/** A mailbox provider for tests that must never reach a mail server: any use is a test mistake and says so. */
export const unusedMailboxProvider: MailboxProvider = {
  async checkAccess() {
    throw new Error('This test should not reach a mail server');
  },
  async readNewEmails() {
    throw new Error('This test should not reach a mail server');
  },
  async sendEmail() {
    throw new Error('This test should not send an email');
  },
};

/** One email the recording provider sent. */
export interface SentEmail {
  access: MailboxAccess;
  to: string;
  subject: string;
  text: string;
  inReplyTo: string | undefined;
  references: string[] | undefined;
}

/**
 * A mailbox provider that keeps what was sent and hands out the emails a test puts in `inbox` (each is given out once per business address, so
 * a repeated check does not return it again unless the test puts it back). `checkResult` is what "Check connection" does.
 */
export function createScriptedMailboxProvider() {
  const inbox: IncomingEmail[] = [];
  const sent: SentEmail[] = [];
  const state = { checkResult: async (): Promise<string> => 'Read access works (3 emails in the inbox)' };
  const provider: MailboxProvider = {
    checkAccess: () => state.checkResult(),
    async readNewEmails() {
      return inbox.splice(0, inbox.length);
    },
    async sendEmail(access, email) {
      sent.push({
        access,
        to: email.to,
        subject: email.subject,
        text: email.text,
        inReplyTo: email.inReplyTo,
        references: email.references,
      });
      return { messageId: `<sent-${sent.length}@test>` };
    },
  };
  return { provider, inbox, sent, state };
}

/** An email from a customer with sensible defaults. */
export function emailFrom(fromEmail: string, overrides: Partial<IncomingEmail> = {}): IncomingEmail {
  return {
    messageId: `<${Math.random().toString(36).slice(2)}@customer.example>`,
    inReplyTo: null,
    references: [],
    fromName: 'Priya',
    fromEmail,
    senderCheck: 'pass',
    subject: 'Rooms for 4 in December',
    receivedAt: new Date(),
    text: 'Hello, do you have rooms for 4 people in December?',
    ...overrides,
  };
}

/** Puts Email into the business's plan and switches it on (the platform does this for a business in real life). */
export async function switchOnEmail(database: import('../../src/kernel/database').Database, accountId: string) {
  await database.system
    .insertInto('account_modules')
    .values({ account_id: accountId, module_id: 'channel.email', entitled: true, enabled: true })
    .execute();
}
