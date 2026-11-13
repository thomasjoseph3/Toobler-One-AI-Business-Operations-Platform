import type { PlatformAiAccess, UpdateAiAccessRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import * as adminRepository from '../repositories/ai-access-admin.repository';
import * as aiSettingsRepository from '../repositories/ai-settings.repository';

/** Reads a business's platform access inside the caller's transaction. An unknown business is a 404. */
async function readAccess(transaction: Db, businessId: string): Promise<PlatformAiAccess> {
  const businessName = await adminRepository.findBusinessName(transaction, businessId);
  if (businessName === undefined) throw notFound('That business');
  const settings = await aiSettingsRepository.findSettings(transaction, businessId);
  return {
    businessId,
    businessName,
    keyMode: settings.keyMode,
    enabled: settings.platformEnabled,
    monthlyCallCap: settings.platformMonthlyCallCap,
    expiresAt: settings.platformExpiresAt ? settings.platformExpiresAt.toISOString() : null,
    noticesEnabled: settings.noticesEnabled,
    ownKeyCount: await adminRepository.countOwnKeys(transaction, businessId),
  };
}

/**
 * What the Toobler team decides about a business's use of the platform's AI keys: on or off, a cap of calls a month, an end date,
 * and whether warning emails go out. Only platform admins reach this (the route's guard checks). It works across businesses, so it
 * runs on the owner connection and names the business in every query.
 */
export function createPlatformAiAccessService({ database }: { database: Database }) {
  return {
    /** A business's platform AI access. An unknown business is a 404. */
    async getAccess(businessId: string): Promise<PlatformAiAccess> {
      return database.runInSystemTransaction((transaction) => readAccess(transaction, businessId));
    },

    /**
     * Changes a business's platform AI access: any of on or off, the monthly cap (null for none), the end date (null for none) and
     * whether warning emails go out. Sending nothing answers 400 NOTHING_TO_CHANGE; an unknown business answers 404. Two log lines
     * are written: one in the business's own log (by "the platform", so the business can see its access changed) and one in the
     * admin's business's log (by the admin, who did it), plus the `ai.access_changed` event for the business (field names only).
     */
    async updateAccess(
      admin: Pick<Principal, 'accountId' | 'userId'>,
      businessId: string,
      request: UpdateAiAccessRequest,
    ): Promise<PlatformAiAccess> {
      const changedFields = Object.entries(request)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field);
      if (changedFields.length === 0) {
        throw new ApiError(
          400,
          'NOTHING_TO_CHANGE',
          'Send at least one of: enabled, monthlyCallCap, expiresAt, noticesEnabled.',
        );
      }
      const adminActor: Actor = { kind: 'user', id: admin.userId };
      return database.runInSystemTransaction(async (transaction) => {
        if ((await adminRepository.findBusinessName(transaction, businessId)) === undefined) {
          throw notFound('That business');
        }
        await adminRepository.savePlatformSettings(transaction, {
          businessId,
          actor: adminActor,
          change: {
            enabled: request.enabled,
            monthlyCallCap: request.monthlyCallCap,
            expiresAt:
              request.expiresAt === undefined
                ? undefined
                : request.expiresAt === null
                  ? null
                  : new Date(request.expiresAt),
            noticesEnabled: request.noticesEnabled,
          },
        });
        // What the business sees in its own history: the platform changed its access (not a named person of another business)
        await writeActivityLog(transaction, {
          accountId: businessId,
          actor: { kind: 'system', id: 'platform' },
          kind: 'ai.access_changed',
          details: { recordType: 'ai_settings', fields: changedFields },
        });
        // What the admin's own business records: this admin changed another business's access
        if (admin.accountId !== businessId) {
          await writeActivityLog(transaction, {
            accountId: admin.accountId,
            actor: adminActor,
            kind: 'platform.ai_access_changed',
            details: { recordType: 'account', recordId: businessId, fields: changedFields },
          });
        }
        await publishEvent(transaction, {
          accountId: businessId,
          eventName: 'ai.access_changed',
          payload: { fields: changedFields },
        });
        return readAccess(transaction, businessId);
      });
    },
  };
}
