import type { EmailCheckResult, EmailConnection, EmailSettings, SaveEmailConnectionRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import type { MailboxProvider } from '../../../../providers/mailbox';
import { encryptSecret, lastFourCharacters } from '../../../core/ai';
import { guessMailServers } from '../helpers/mailbox-defaults';
import * as emailConnectionRepository from '../repositories/email-connection.repository';
import type { EmailConnectionRow } from '../repositories/email-connection.repository';
import { openMailboxAccess } from './mailbox-access.service';

/** Turns a database row into the connection the API answers with: only a preview of the password, never the password. */
export function toEmailConnection(row: EmailConnectionRow): EmailConnection {
  return {
    address: row.address,
    username: row.username,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    passwordPreview: `••••${row.passwordLastFour}`,
    replyMode: row.replyMode,
    readEmails: row.readEmails,
    status: row.status,
    statusNote: row.statusNote,
    statusCheckedAt: row.statusCheckedAt ? row.statusCheckedAt.toISOString() : null,
    lastEmailAt: row.lastEmailAt ? row.lastEmailAt.toISOString() : null,
  };
}

/**
 * The business's email connection: connect a mailbox with its password, see its state, check it, change how the AI answers, disconnect. The
 * routes call this. The password is scrambled before it touches the database and is never returned, logged or put in an event.
 */
export function createEmailConnectionService(dependencies: {
  database: Database;
  config: Config;
  mailbox: MailboxProvider;
}) {
  const { database, config, mailbox } = dependencies;

  /** The server's secret, or a 503 when none is set (a password can then be neither kept nor read safely). */
  function requireSecretKey(): Buffer {
    const secretKey = config.secrets.encryptionKey;
    if (!secretKey) {
      throw new ApiError(
        503,
        'SECRETS_NOT_SET_UP',
        'This server cannot keep keys safe yet: SECRETS_ENCRYPTION_KEY is not set. Ask the platform team.',
      );
    }
    return secretKey;
  }

  return {
    /** What the screen shows: the connection, or none. */
    async readSettings(principal: Pick<Principal, 'accountId'>): Promise<EmailSettings> {
      const row = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        emailConnectionRepository.findConnection(transaction, principal.accountId),
      );
      return { connection: row ? toEmailConnection(row) : null };
    },

    /**
     * Connects a mailbox, or changes the connection. The password is needed the first time (400 `PASSWORD_NEEDED`); later, leaving it out
     * keeps the saved one. Server names left out are guessed from the address (Gmail and Outlook are known). A new login puts the status
     * back to "unchecked". Writes an activity-log line (field names only, never the password). Answers with the connection as it now is.
     */
    async saveConnection(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: SaveEmailConnectionRequest,
    ): Promise<EmailConnection> {
      const secretKey = requireSecretKey();
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const row = await database.runInAccountTransaction(accountId, async (transaction) => {
        const existing = await emailConnectionRepository.findConnection(transaction, accountId);
        if (!existing) {
          if (request.password === undefined) {
            throw new ApiError(
              400,
              'PASSWORD_NEEDED',
              'Type the mailbox password (for Gmail, an app password) to connect it.',
            );
          }
          const guessed = guessMailServers(request.address);
          await emailConnectionRepository.insertConnection(transaction, {
            accountId,
            address: request.address,
            username: request.username ?? request.address,
            encryptedPassword: encryptSecret(request.password, secretKey, accountId),
            passwordLastFour: lastFourCharacters(request.password),
            imapHost: request.imapHost ?? guessed.imapHost,
            imapPort: request.imapPort ?? 993,
            smtpHost: request.smtpHost ?? guessed.smtpHost,
            smtpPort: request.smtpPort ?? 587,
            replyMode: request.replyMode ?? 'draft',
            readEmails: request.readEmails ?? true,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'email.connected',
            details: { recordType: 'email_connection', recordId: accountId },
          });
        } else {
          const changes: emailConnectionRepository.EmailConnectionChanges = {};
          if (request.address !== existing.address) changes.address = request.address;
          if (request.username !== undefined && request.username !== existing.username)
            changes.username = request.username;
          if (request.imapHost !== undefined && request.imapHost !== existing.imapHost)
            changes.imapHost = request.imapHost;
          if (request.imapPort !== undefined && request.imapPort !== existing.imapPort)
            changes.imapPort = request.imapPort;
          if (request.smtpHost !== undefined && request.smtpHost !== existing.smtpHost)
            changes.smtpHost = request.smtpHost;
          if (request.smtpPort !== undefined && request.smtpPort !== existing.smtpPort)
            changes.smtpPort = request.smtpPort;
          if (request.replyMode !== undefined && request.replyMode !== existing.replyMode)
            changes.replyMode = request.replyMode;
          if (request.readEmails !== undefined && request.readEmails !== existing.readEmails)
            changes.readEmails = request.readEmails;
          if (request.password !== undefined) {
            changes.encryptedPassword = encryptSecret(request.password, secretKey, accountId);
            changes.passwordLastFour = lastFourCharacters(request.password);
          }
          if (Object.keys(changes).length > 0) {
            await emailConnectionRepository.updateConnection(transaction, { accountId, changes, actor });
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'email.changed',
              details: { recordType: 'email_connection', recordId: accountId, fields: Object.keys(changes) },
            });
          }
        }
        const saved = await emailConnectionRepository.findConnection(transaction, accountId);
        if (!saved) throw new Error('The connection was saved but could not be read back.');
        return saved;
      });
      return toEmailConnection(row);
    },

    /**
     * Signs in to the mailbox with the saved login (it reads nothing and changes nothing) and keeps the answer: "working", or "failed" with
     * the mail server's plain reason. 404 when no mailbox is connected.
     */
    async checkConnection(principal: Pick<Principal, 'accountId'>): Promise<EmailCheckResult> {
      requireSecretKey();
      const { accountId } = principal;
      const opened = await openMailboxAccess(database, config, accountId);
      if (!opened) throw notFound('An email connection');
      let status: 'working' | 'failed';
      let note: string;
      try {
        note = await mailbox.checkAccess(opened.access);
        status = 'working';
      } catch (error) {
        status = 'failed';
        // The mail server's reason is plain words about the login; it never contains the password
        note = error instanceof Error ? error.message : 'The mail server could not be reached.';
      }
      const row = await database.runInAccountTransaction(accountId, async (transaction) => {
        await emailConnectionRepository.saveCheckResult(transaction, {
          accountId,
          status,
          note,
          checkedAt: new Date(),
        });
        return emailConnectionRepository.findConnection(transaction, accountId);
      });
      if (!row) throw notFound('An email connection');
      return { ok: status === 'working', note: row.statusNote ?? note, connection: toEmailConnection(row) };
    },

    /** Removes the connection and the saved password. Conversations and drafts stay. 404 when no mailbox is connected. */
    async disconnect(principal: Pick<Principal, 'accountId' | 'userId'>): Promise<void> {
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const wasRemoved = await emailConnectionRepository.deleteConnection(transaction, accountId);
        if (!wasRemoved) throw notFound('An email connection');
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'email.disconnected',
          details: { recordType: 'email_connection', recordId: accountId },
        });
      });
    },
  };
}
