import { createHash } from 'node:crypto';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { JobServices } from '../../../../kernel/jobs/jobs';
import { LLM_PROVIDER_IDS } from '../../../../providers/llm';
import {
  buildFallbackStormEmail,
  buildModelRetiringEmail,
  buildModelsMissingEmail,
  buildNewModelsEmail,
  buildOwnKeyProblemEmail,
  buildPlatformKeyProblemEmail,
} from '../helpers/ai-notice-emails';
import { AI_TASKS } from '../helpers/ai-tasks';
import { findMissingModels, findNewModelCandidates, retirementWarningDue } from '../helpers/model-watch';
import { decryptSecret } from '../helpers/secret-box';
import * as aiHealthRepository from '../repositories/ai-health.repository';
import * as aiKeysRepository from '../repositories/ai-keys.repository';
import { findAllModels } from '../repositories/ai-models.repository';
import * as aiSettingsRepository from '../repositories/ai-settings.repository';
import { createAiNoticeSender } from './ai-notices.service';
import { testKeyWithModels } from './key-tester.service';

const HOURS_BETWEEN_REMINDERS = 24;
/** How many calls that needed a fallback, within an hour, make a warning. */
const FALLBACK_STORM_MINIMUM = 5;
const CALL_RECORDS_KEPT_DAYS = 90;
const MILLISECONDS_PER_HOUR = 3_600_000;

/** A short, stable fingerprint of some text, for warning keys (so a different set of models is a different warning). */
function shortFingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * The daily and hourly checks on the AI: do the platform's own keys work, do the models we list still exist, are any about to
 * retire, do the businesses' own keys work, is some job falling back again and again; and the clean-up of old call records. Each
 * problem sends one warning email (a reminder a day while it lasts) to the right people: the platform team for the platform's keys
 * and models, a business's managers for its own keys (when the business has warnings switched on).
 */
export function createAiHealthService({
  services,
  now = () => new Date(),
  reportProblem = () => {},
}: {
  services: JobServices;
  now?: () => Date;
  reportProblem?: (what: string, error: unknown) => void;
}) {
  const { database, config, llm, mail } = services;
  const notices = createAiNoticeSender({ database, mail, now });

  return {
    /** Tests each of the platform's own keys with a tiny real call, saves what it found, and warns the platform team about a bad one. */
    async checkPlatformKeys(): Promise<{ tested: number; problems: number }> {
      const catalogue = await findAllModels(database.system);
      const admins = await notices.findPlatformAdmins();
      let tested = 0;
      let problems = 0;
      for (const provider of LLM_PROVIDER_IDS) {
        const keys = config.ai.platformKeys[provider];
        for (const [index, plainKey] of keys.entries()) {
          const keyPosition = index + 1;
          const { finding } = await testKeyWithModels({
            llm,
            catalogue,
            provider,
            plainKey,
            keySource: 'platform',
            keyPosition,
          });
          tested += 1;
          // A test that could not tell (network trouble) leaves the earlier finding as it was
          if (finding.status === null) continue;
          await aiHealthRepository.savePlatformKeyCheck(database.system, {
            provider,
            keyPosition,
            status: finding.status === 'working' ? 'working' : finding.status === 'limited' ? 'limited' : 'failed',
            note: finding.note,
            checkedAt: now(),
          });
          if (finding.status === 'failed' || finding.status === 'limited') {
            problems += 1;
            await notices.sendOnce({
              noticeKey: `platform-key:${provider}:${keyPosition}`,
              repeatAfterHours: HOURS_BETWEEN_REMINDERS,
              recipients: admins,
              buildEmail: (person) =>
                buildPlatformKeyProblemEmail(person, {
                  provider,
                  keyPosition,
                  status: finding.status as 'failed' | 'limited',
                  note: finding.note,
                }),
            });
          }
        }
      }
      return { tested, problems };
    },

    /**
     * Asks each company (with the first platform key that can) which models it lists. Warns the platform team about models of ours
     * the company no longer lists, and once about new models it now offers. The list alone does not prove a model works; the key
     * tests do that.
     */
    async checkModels(): Promise<{ missing: number; suggested: number }> {
      const catalogue = await findAllModels(database.system);
      const admins = await notices.findPlatformAdmins();
      let missing = 0;
      let suggested = 0;
      for (const provider of LLM_PROVIDER_IDS) {
        let listed: string[] | undefined;
        for (const plainKey of config.ai.platformKeys[provider]) {
          try {
            listed = await llm.listModels(provider, plainKey);
            break;
          } catch (error) {
            reportProblem(`Could not list the ${provider} models with one platform key`, error);
          }
        }
        if (listed === undefined) continue;
        const gone = findMissingModels(catalogue, provider, listed);
        if (gone.length > 0) {
          missing += gone.length;
          const names = gone.map((model) => model.modelName).sort();
          await notices.sendOnce({
            noticeKey: `models-missing:${provider}:${shortFingerprint(names.join(','))}`,
            repeatAfterHours: HOURS_BETWEEN_REMINDERS,
            recipients: admins,
            buildEmail: (person) => buildModelsMissingEmail(person, provider, names),
          });
        }
        const known = new Set(catalogue.filter((model) => model.provider === provider).map((model) => model.modelName));
        const fresh = findNewModelCandidates(provider, listed, known);
        if (fresh.length > 0) {
          suggested += fresh.length;
          await notices.sendOnce({
            noticeKey: `new-models:${provider}:${shortFingerprint(fresh.join(','))}`,
            repeatAfterHours: null,
            recipients: admins,
            buildEmail: (person) => buildNewModelsEmail(person, provider, fresh),
          });
        }
      }
      return { missing, suggested };
    },

    /** Warns the platform team 30 days and 7 days before a model's retirement date, and once when it has passed. */
    async checkRetirements(): Promise<{ warned: number }> {
      const catalogue = await findAllModels(database.system);
      const admins = await notices.findPlatformAdmins();
      let warned = 0;
      for (const model of catalogue) {
        if (model.status === 'retired' || model.retiresOn === null) continue;
        const warning = retirementWarningDue(model.retiresOn, now());
        if (warning === null) continue;
        const retiresOn = model.retiresOn;
        const sent = await notices.sendOnce({
          noticeKey: `model-retiring:${model.id}:${warning}`,
          repeatAfterHours: null,
          recipients: admins,
          buildEmail: (person) =>
            buildModelRetiringEmail(person, { label: model.label, modelName: model.modelName, retiresOn, warning }),
        });
        if (sent) warned += 1;
      }
      return { warned };
    },

    /**
     * Tests each of one business's own keys, notes what it found on the key, and warns the business's managers about a failing or
     * limited key (a reminder a day while it lasts), unless the business has warnings switched off. A key that cannot even be
     * unscrambled counts as failed. Does nothing when the server has no encryption secret.
     */
    async checkBusinessKeys(accountId: string): Promise<{ tested: number; problems: number }> {
      const secretKey = config.secrets.encryptionKey;
      if (!secretKey) return { tested: 0, problems: 0 };
      const { keys, catalogue, settings } = await database.runInAccountTransaction(accountId, async (transaction) => ({
        keys: await aiKeysRepository.listKeysToCheck(transaction, accountId),
        catalogue: await findAllModels(transaction),
        settings: await aiSettingsRepository.findSettings(transaction, accountId),
      }));
      let problems = 0;
      for (const key of keys) {
        let finding;
        try {
          const plainKey = decryptSecret(key.encryptedKey, secretKey, accountId);
          finding = (
            await testKeyWithModels({
              llm,
              catalogue,
              provider: key.provider,
              plainKey,
              keySource: 'own',
              keyPosition: 1,
            })
          ).finding;
        } catch (error) {
          reportProblem('Could not read a saved AI key', error);
          finding = {
            outcome: 'rejected' as const,
            status: 'failed' as const,
            note: 'The saved key could not be read. Replace it.',
          };
        }
        const actor = { kind: 'system' as const, id: 'ai.check_business_keys' };
        await database.runInAccountTransaction(accountId, async (transaction) => {
          await aiKeysRepository.recordKeyTest(transaction, {
            accountId,
            keyId: key.id,
            status: finding.status,
            note: finding.note,
            checkedAt: now(),
            actor,
          });
          if (finding.status !== null && finding.status !== key.status) {
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'ai.key_status_changed',
              details: { recordType: 'ai_key', recordId: key.id, fields: ['status'] },
            });
          }
        });
        if (finding.status !== 'failed' && finding.status !== 'limited') continue;
        problems += 1;
        const lastNoticeAt = key.lastNoticeAt;
        const reminderDue =
          lastNoticeAt === null ||
          now().getTime() - lastNoticeAt.getTime() >= HOURS_BETWEEN_REMINDERS * MILLISECONDS_PER_HOUR;
        if (!settings.noticesEnabled || !reminderDue) continue;
        const managers = await notices.findManagers(accountId);
        if (managers.length === 0) continue;
        const status = finding.status;
        for (const person of managers) {
          await mail.send(
            buildOwnKeyProblemEmail(person, { label: key.label, provider: key.provider, status, note: finding.note }),
          );
        }
        await database.runInAccountTransaction(accountId, (transaction) =>
          aiKeysRepository.noteKeyNoticeSent(transaction, { accountId, keyId: key.id, sentAt: now() }),
        );
      }
      return { tested: keys.length, problems };
    },

    /**
     * Looks at the last hour for jobs that needed a fallback again and again (5 times or more). Warns the business's managers when
     * the calls were on its own keys, or the platform team when they were on the platform's keys; one warning a day per job.
     */
    async checkFallbackStorms(): Promise<{ warned: number }> {
      const storms = await aiHealthRepository.findFallbackStorms(database.system, {
        since: new Date(now().getTime() - MILLISECONDS_PER_HOUR),
        minimum: FALLBACK_STORM_MINIMUM,
      });
      const admins = await notices.findPlatformAdmins();
      let warned = 0;
      for (const storm of storms) {
        const taskLabel = AI_TASKS.find((task) => task.id === storm.task)?.label ?? storm.task;
        let recipients = admins;
        if (storm.keySource === 'own') {
          const settings = await database.runInAccountTransaction(storm.accountId, (transaction) =>
            aiSettingsRepository.findSettings(transaction, storm.accountId),
          );
          recipients = settings.noticesEnabled ? await notices.findManagers(storm.accountId) : [];
        }
        const sent = await notices.sendOnce({
          noticeKey: `fallback:${storm.accountId}:${storm.task}:${storm.keySource}`,
          repeatAfterHours: HOURS_BETWEEN_REMINDERS,
          recipients,
          buildEmail: (person) =>
            buildFallbackStormEmail(person, {
              taskLabel,
              count: storm.count,
              usingPlatformKeys: storm.keySource === 'platform',
            }),
        });
        if (sent) warned += 1;
      }
      return { warned };
    },

    /** Deletes call records older than 90 days. The daily totals (and so the monthly cap) are kept. Returns how many were deleted. */
    async cleanOldCalls(): Promise<number> {
      return aiHealthRepository.deleteCallsOlderThan(
        database.system,
        new Date(now().getTime() - CALL_RECORDS_KEPT_DAYS * 24 * MILLISECONDS_PER_HOUR),
      );
    },
  };
}
