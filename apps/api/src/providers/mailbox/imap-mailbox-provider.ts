import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import {
  checkSender,
  chooseTextPart,
  htmlToText,
  isAutomatedEmail,
  MOST_CHARACTERS_OF_EMAIL_TEXT,
  parseHeaders,
  readMessageIds,
  withoutQuotedText,
} from './mail-parsing';
import type { IncomingEmail, MailboxAccess, MailboxProvider } from './mailbox-provider';

// The real mailbox: IMAP to read (imapflow) and SMTP to send (nodemailer). Ported from the hotel agent's mailbox reader. Read only: the inbox
// is opened read-only, so nothing is deleted, moved or marked as read.

/** At most this many emails are taken per check, newest first: a full inbox is worked through over several checks. */
const MOST_EMAILS_PER_CHECK = 40;
/** A mail server that hangs must not hold up the check for ever. */
const SOCKET_TIMEOUT_MILLISECONDS = 60_000;

/** Signs in over IMAP (TLS). The caller must log out. */
async function connect(access: MailboxAccess): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: access.imapHost,
    port: access.imapPort,
    secure: true,
    auth: { user: access.username, pass: access.password },
    logger: false,
    socketTimeout: SOCKET_TIMEOUT_MILLISECONDS,
  });
  await client.connect();
  return client;
}

/** Reads the chosen text part of one message and turns it into the new words only. */
async function readText(client: ImapFlow, uid: number, chosen: { part: string; isHtml: boolean }): Promise<string> {
  const download = await client.download(String(uid), chosen.part, {
    uid: true,
    maxBytes: MOST_CHARACTERS_OF_EMAIL_TEXT * 4,
  });
  if (!download || !download.content) return '';
  const { content } = download;
  let text = '';
  for await (const chunk of content) text += Buffer.from(chunk).toString('utf8');
  return withoutQuotedText(chosen.isHtml ? htmlToText(text) : text).slice(0, MOST_CHARACTERS_OF_EMAIL_TEXT);
}

export function createImapMailboxProvider(): MailboxProvider {
  return {
    async checkAccess(access) {
      const client = await connect(access);
      try {
        const status = await client.status('INBOX', { messages: true });
        return `Read access to ${access.imapHost} works (${status && 'messages' in status ? (status.messages ?? 0) : 0} emails in the inbox)`;
      } finally {
        await client.logout().catch(() => undefined);
      }
    },

    async readNewEmails(access, options) {
      const client = await connect(access);
      try {
        const emails: IncomingEmail[] = [];
        const ownAddress = access.address.toLowerCase();
        const inbox = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
          const isGmail = /(^|\.)gmail\.com$|googlemail\.com$/i.test(access.imapHost);
          // In Gmail only the Primary tab is read: promotions and social mail are never enquiries
          const found = await client.search(
            { since: options.since, answered: false, ...(isGmail ? { gmraw: 'category:primary' } : {}) },
            { uid: true },
          );
          const uids = found || [];
          const fetched = uids.length
            ? await client.fetchAll(
                uids.slice(-MOST_EMAILS_PER_CHECK),
                {
                  uid: true,
                  envelope: true,
                  internalDate: true,
                  bodyStructure: true,
                  headers: [
                    'references',
                    'list-unsubscribe',
                    'list-id',
                    'auto-submitted',
                    'precedence',
                    'authentication-results',
                  ],
                },
                { uid: true },
              )
            : [];
          for (const message of fetched) {
            const messageId = message.envelope?.messageId;
            const sender = message.envelope?.from?.[0];
            if (!messageId || !sender?.address || sender.address.toLowerCase() === ownAddress) continue;
            const headers = parseHeaders(message.headers);
            if (isAutomatedEmail(headers, sender.address)) continue;
            const chosen = chooseTextPart(message.bodyStructure);
            emails.push({
              messageId,
              inReplyTo: message.envelope?.inReplyTo || null,
              references: readMessageIds(headers['references']),
              fromName: sender.name || null,
              fromEmail: sender.address.toLowerCase(),
              senderCheck: checkSender(headers, sender.address, access.imapHost),
              subject: message.envelope?.subject || '',
              receivedAt:
                message.internalDate instanceof Date
                  ? message.internalDate
                  : new Date(message.envelope?.date ?? Date.now()),
              text: chosen ? await readText(client, message.uid, chosen) : '',
            });
          }
        } finally {
          inbox.release();
        }

        // Answered from the Sent folder (by us earlier, or by the team in their mail app): not unanswered after all
        const mailboxes = await client.list();
        const sentFolder = mailboxes.find((mailbox) => mailbox.specialUse === '\\Sent');
        const answeredIds = new Set<string>();
        if (sentFolder && emails.length > 0) {
          const sent = await client.getMailboxLock(sentFolder.path, { readOnly: true });
          try {
            for (const email of emails) {
              const replies = await client.search({ header: { 'in-reply-to': email.messageId } }, { uid: true });
              if (replies && replies.length > 0) answeredIds.add(email.messageId);
            }
          } finally {
            sent.release();
          }
        }
        return emails
          .filter((email) => !answeredIds.has(email.messageId))
          .sort((first, second) => first.receivedAt.getTime() - second.receivedAt.getTime());
      } finally {
        await client.logout().catch(() => undefined);
      }
    },

    async sendEmail(access, email) {
      const transport = createTransport({
        host: access.smtpHost,
        port: access.smtpPort,
        // Port 465 is TLS from the start; the others (587) start plain and upgrade
        secure: access.smtpPort === 465,
        auth: { user: access.username, pass: access.password },
        connectionTimeout: SOCKET_TIMEOUT_MILLISECONDS,
      });
      const sent = await transport.sendMail({
        from: access.address,
        to: email.to,
        subject: email.subject,
        text: email.text,
        ...(email.inReplyTo ? { inReplyTo: email.inReplyTo } : {}),
        ...(email.references && email.references.length > 0 ? { references: email.references } : {}),
      });
      return { messageId: typeof sent.messageId === 'string' ? sent.messageId : null };
    },
  };
}
