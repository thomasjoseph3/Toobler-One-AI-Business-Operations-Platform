import type {
  SaveWhatsappConnectionRequest,
  WhatsappCheckResult,
  WhatsappConnection,
  WhatsappSettings,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import type { WhatsappProvider } from '../../../../providers/whatsapp';
import { decryptSecret, encryptSecret, lastFourCharacters } from '../../../core/ai';
import { buildChatLink } from '../helpers/whatsapp-text';
import * as whatsappConnectionRepository from '../repositories/whatsapp-connection.repository';
import type { WhatsappConnectionRow } from '../repositories/whatsapp-connection.repository';

// The database error code for "a unique rule was broken".
const UNIQUE_VIOLATION = '23505';

/** Turns a database row into the connection the API answers with: only a preview of the token, never the token. */
export function toWhatsappConnection(row: WhatsappConnectionRow): WhatsappConnection {
  return {
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    displayPhoneNumber: row.displayPhoneNumber,
    tokenPreview: `••••${row.tokenLastFour}`,
    answerMessages: row.answerMessages,
    status: row.status,
    statusNote: row.statusNote,
    statusCheckedAt: row.statusCheckedAt ? row.statusCheckedAt.toISOString() : null,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    chatLink: buildChatLink(row.displayPhoneNumber),
  };
}

/**
 * The business's WhatsApp connection: connect a number with its token, see its state, check it with Meta, disconnect. The routes call this.
 * The token is scrambled before it touches the database and is never returned, logged or put in an event.
 */
export function createWhatsappConnectionService(dependencies: {
  database: Database;
  config: Config;
  whatsapp: WhatsappProvider;
}) {
  const { database, config, whatsapp } = dependencies;

  /** The server's secret, or a 503 when none is set (a token can then be neither kept nor read safely). */
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
    /** What the screen shows: the connection (or none) and what to type into Meta (the webhook address and the verify token). */
    async readSettings(principal: Pick<Principal, 'accountId'>): Promise<WhatsappSettings> {
      const row = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        whatsappConnectionRepository.findConnection(transaction, principal.accountId),
      );
      const platformReady = config.whatsapp.appSecret !== null && config.whatsapp.verifyToken !== null;
      return {
        connection: row ? toWhatsappConnection(row) : null,
        webhookUrl: platformReady ? `${config.publicBaseUrl}/webhooks/whatsapp` : null,
        verifyToken: platformReady ? config.whatsapp.verifyToken : null,
        platformReady,
      };
    },

    /**
     * Connects a number, or changes the connection. The token is needed the first time (400 `TOKEN_NEEDED`); later, leaving it out keeps the
     * saved one. A number another business already uses answers 409 `NUMBER_IN_USE`. A new number or token puts the status back to
     * "unchecked". Writes an activity-log line (field names only, never the token). Answers with the connection as it now is.
     */
    async saveConnection(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: SaveWhatsappConnectionRequest,
    ): Promise<WhatsappConnection> {
      const secretKey = requireSecretKey();
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      try {
        const row = await database.runInAccountTransaction(accountId, async (transaction) => {
          const existing = await whatsappConnectionRepository.findConnection(transaction, accountId);
          if (
            await whatsappConnectionRepository.isNumberUsedByAnotherBusiness(
              database.system,
              request.phoneNumberId,
              accountId,
            )
          ) {
            throw conflict('NUMBER_IN_USE', 'That WhatsApp number is already connected to another business.');
          }
          if (!existing) {
            if (request.accessToken === undefined) {
              throw new ApiError(400, 'TOKEN_NEEDED', 'Paste the access token from Meta to connect the number.');
            }
            await whatsappConnectionRepository.insertConnection(transaction, {
              accountId,
              phoneNumberId: request.phoneNumberId,
              businessAccountId: request.businessAccountId ?? null,
              encryptedAccessToken: encryptSecret(request.accessToken, secretKey, accountId),
              tokenLastFour: lastFourCharacters(request.accessToken),
              answerMessages: request.answerMessages ?? true,
              actor,
            });
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'whatsapp.connected',
              details: { recordType: 'whatsapp_connection', recordId: accountId },
            });
          } else {
            const changes: whatsappConnectionRepository.ConnectionChanges = {};
            if (request.phoneNumberId !== existing.phoneNumberId) changes.phoneNumberId = request.phoneNumberId;
            if (request.businessAccountId !== undefined && request.businessAccountId !== existing.businessAccountId) {
              changes.businessAccountId = request.businessAccountId;
            }
            if (request.accessToken !== undefined) {
              changes.encryptedAccessToken = encryptSecret(request.accessToken, secretKey, accountId);
              changes.tokenLastFour = lastFourCharacters(request.accessToken);
            }
            if (request.answerMessages !== undefined && request.answerMessages !== existing.answerMessages) {
              changes.answerMessages = request.answerMessages;
            }
            if (Object.keys(changes).length > 0) {
              await whatsappConnectionRepository.updateConnection(transaction, { accountId, changes, actor });
              await writeActivityLog(transaction, {
                accountId,
                actor,
                kind: 'whatsapp.changed',
                details: { recordType: 'whatsapp_connection', recordId: accountId, fields: Object.keys(changes) },
              });
            }
          }
          const saved = await whatsappConnectionRepository.findConnection(transaction, accountId);
          if (!saved) throw new Error('The connection was saved but could not be read back.');
          return saved;
        });
        return toWhatsappConnection(row);
      } catch (error) {
        // Two businesses saving the same number at the same moment: the database rule decides
        if (typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw conflict('NUMBER_IN_USE', 'That WhatsApp number is already connected to another business.');
        }
        throw error;
      }
    },

    /**
     * Asks Meta about the number with the saved token (it sends nothing to anyone), and keeps the answer: "working" with the number as
     * customers see it, or "failed" with Meta's plain reason. 404 when no number is connected.
     */
    async checkConnection(principal: Pick<Principal, 'accountId'>): Promise<WhatsappCheckResult> {
      const secretKey = requireSecretKey();
      const { accountId } = principal;
      const access = await database.runInAccountTransaction(accountId, (transaction) =>
        whatsappConnectionRepository.findAccessForSending(transaction, accountId),
      );
      if (!access) throw notFound('A WhatsApp connection');
      let status: 'working' | 'failed';
      let note: string;
      let displayPhoneNumber: string | null = null;
      try {
        const info = await whatsapp.readNumber({
          accessToken: decryptSecret(access.encryptedAccessToken, secretKey, accountId),
          phoneNumberId: access.phoneNumberId,
        });
        status = 'working';
        displayPhoneNumber = info.displayPhoneNumber;
        note = `Connected to ${info.verifiedName ?? 'WhatsApp'}${info.displayPhoneNumber ? ` (${info.displayPhoneNumber})` : ''}`;
      } catch (error) {
        status = 'failed';
        // Meta's reason is plain words about the number or token; it never contains the token
        note = error instanceof Error ? error.message : 'Meta could not be reached.';
      }
      const row = await database.runInAccountTransaction(accountId, async (transaction) => {
        await whatsappConnectionRepository.saveCheckResult(transaction, {
          accountId,
          status,
          note,
          displayPhoneNumber,
          checkedAt: new Date(),
        });
        return whatsappConnectionRepository.findConnection(transaction, accountId);
      });
      if (!row) throw notFound('A WhatsApp connection');
      return { ok: status === 'working', note: row.statusNote ?? note, connection: toWhatsappConnection(row) };
    },

    /** Removes the connection and the saved token. The conversations stay. 404 when no number is connected. */
    async disconnect(principal: Pick<Principal, 'accountId' | 'userId'>): Promise<void> {
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const wasRemoved = await whatsappConnectionRepository.deleteConnection(transaction, accountId);
        if (!wasRemoved) throw notFound('A WhatsApp connection');
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'whatsapp.disconnected',
          details: { recordType: 'whatsapp_connection', recordId: accountId },
        });
      });
    },
  };
}
