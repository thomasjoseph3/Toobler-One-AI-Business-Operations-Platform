import {
  MAX_AI_KEYS_PER_PROVIDER,
  type AddAiKeyRequest,
  type AiKey,
  type AiKeysResponse,
  type AiKeyTestResult,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import type { LlmProvider } from '../../../../providers/llm';
import { decryptSecret, encryptSecret, fingerprintSecret, lastFourCharacters } from '../helpers/secret-box';
import { findAllModels } from '../repositories/ai-models.repository';
import * as aiKeysRepository from '../repositories/ai-keys.repository';
import { testKeyWithModels } from './key-tester.service';
import type { AiKeyRow } from '../repositories/ai-keys.repository';

// The database error code for "a unique rule was broken".
const UNIQUE_VIOLATION = '23505';

/** Turns a database row into the AiKey the API answers with: only a preview of the key, never the key. */
export function toAiKey(row: AiKeyRow): AiKey {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    keyPreview: `••••${row.keyLastFour}`,
    status: row.status,
    statusNote: row.statusNote,
    statusCheckedAt: row.statusCheckedAt ? row.statusCheckedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The keys a business saves for itself. The routes call this. A key is scrambled before it touches the database and is
 * never returned, logged or put in an event: everything shows only its last four characters.
 */
export function createAiKeysService({
  database,
  config,
  llm,
}: {
  database: Database;
  config: Config;
  llm: LlmProvider;
}) {
  /** The server's secret, or a 503 when none is set (a key can then be neither kept nor read safely). */
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
    /** The business's saved keys, oldest first, each with its status. Never the keys themselves. */
    async listKeys(principal: Pick<Principal, 'accountId'>): Promise<AiKeysResponse> {
      const rows = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        aiKeysRepository.listKeys(transaction, principal.accountId),
      );
      return { items: rows.map(toAiKey) };
    },

    /**
     * Saves a key the manager pasted: scrambled, with its last four characters kept for display. The same key twice answers 409
     * AI_KEY_EXISTS naming the label it was saved under; more than 10 keys for one company answers 409 TOO_MANY_AI_KEYS; a server
     * with no SECRETS_ENCRYPTION_KEY answers 503 (it cannot keep a secret safely). The key starts `unchecked`. Writes an
     * activity-log line and the `ai.key_added` event (ids and field names only, never the key). Answers with the saved key.
     */
    async addKey(principal: Pick<Principal, 'accountId' | 'userId'>, request: AddAiKeyRequest): Promise<AiKey> {
      const secretKey = requireSecretKey();
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const fingerprint = fingerprintSecret(request.key, secretKey, `${accountId}:${request.provider}`);
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Two keys saved at the same moment take turns, so the checks below cannot both pass
          await aiKeysRepository.lockAiKeysOfBusiness(transaction, accountId);
          const sameKey = await aiKeysRepository.findKeyByFingerprint(
            transaction,
            accountId,
            request.provider,
            fingerprint,
          );
          if (sameKey) {
            throw conflict('AI_KEY_EXISTS', `That key is already saved as "${sameKey.label}".`, {
              existingKeyId: sameKey.id,
            });
          }
          const savedCount = await aiKeysRepository.countKeysOfProvider(transaction, accountId, request.provider);
          if (savedCount >= MAX_AI_KEYS_PER_PROVIDER) {
            throw conflict(
              'TOO_MANY_AI_KEYS',
              `You can save up to ${MAX_AI_KEYS_PER_PROVIDER} keys for one AI company. Remove one first.`,
            );
          }
          const keyId = uuidv7();
          await aiKeysRepository.insertKey(transaction, {
            id: keyId,
            accountId,
            provider: request.provider,
            label: request.label,
            encryptedKey: encryptSecret(request.key, secretKey, accountId),
            keyLastFour: lastFourCharacters(request.key),
            keyFingerprint: fingerprint,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'ai.key_added',
            // Which fields were filled in, never their values (and never the key)
            details: { recordType: 'ai_key', recordId: keyId, fields: ['provider', 'label', 'key'] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'ai.key_added',
            payload: { keyId, provider: request.provider },
          });
          const saved = await aiKeysRepository.findKeyById(transaction, accountId, keyId);
          if (!saved) throw new Error('The key that was just saved cannot be read');
          return toAiKey(saved);
        });
      } catch (error) {
        // The unique index decides when two adds of one key race; answer them the same way as the early check does
        if (error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION) {
          throw conflict('AI_KEY_EXISTS', 'That key is already saved.');
        }
        throw error;
      }
    },

    /**
     * Removes a key: it disappears from the list and its scrambled secret is wiped from the database, so nothing of the key is
     * left (and the same key can be saved again later). An unknown, already removed or other business's key answers 404. Writes an
     * activity-log line and the `ai.key_removed` event (ids only).
     */
    async removeKey(principal: Pick<Principal, 'accountId' | 'userId'>, keyId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        await aiKeysRepository.lockAiKeysOfBusiness(transaction, accountId);
        const removed = await aiKeysRepository.removeKeyAndWipeSecret(transaction, {
          accountId,
          keyId,
          actor,
          now: new Date(),
        });
        if (!removed) throw notFound('That key');
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'ai.key_removed',
          details: { recordType: 'ai_key', recordId: keyId },
        });
        await publishEvent(transaction, { accountId, eventName: 'ai.key_removed', payload: { keyId } });
      });
    },

    /**
     * Tests a saved key with a tiny real call ("reply with the single word OK") to the key's own AI company, trying up to three of
     * its models. Writes the result on the key (status, a plain note, the time) and answers with the key, what was found, and which
     * model answered. The database is not held open during the call. A key the company rejects becomes `failed`, a used-up quota
     * `limited`, a working key `working`; a timeout or network problem leaves the status as it was. An unknown, removed or other
     * business's key answers 404.
     */
    async testKey(principal: Pick<Principal, 'accountId' | 'userId'>, keyId: string): Promise<AiKeyTestResult> {
      const secretKey = requireSecretKey();
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      // 1. Read the scrambled key and the models to try, then let go of the database before the (slow) call
      const { stored, catalogue } = await database.runInAccountTransaction(accountId, async (transaction) => ({
        stored: await aiKeysRepository.findKeySecretById(transaction, accountId, keyId),
        catalogue: await findAllModels(transaction),
      }));
      if (!stored) throw notFound('That key');
      const plainKey = decryptSecret(stored.encryptedKey, secretKey, accountId);

      // 2. Ask the key's own company to answer, model by model (the first that answers proves the key works)
      const { finding, modelName, latencyMs } = await testKeyWithModels({
        llm,
        catalogue,
        provider: stored.provider,
        plainKey,
        keySource: 'own',
        keyPosition: 1,
      });

      // 3. Write the result on the key. If the key was removed while the test ran, there is nothing to write: 404.
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const written = await aiKeysRepository.recordKeyTest(transaction, {
          accountId,
          keyId,
          status: finding.status,
          note: finding.note,
          checkedAt: new Date(),
          actor,
        });
        if (!written) throw notFound('That key');
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'ai.key_tested',
          // Which field changed, never the key
          details: { recordType: 'ai_key', recordId: keyId, fields: ['status'] },
        });
        const updated = await aiKeysRepository.findKeyById(transaction, accountId, keyId);
        if (!updated) throw notFound('That key');
        return { key: toAiKey(updated), outcome: finding.outcome, modelName, latencyMs };
      });
    },
  };
}
