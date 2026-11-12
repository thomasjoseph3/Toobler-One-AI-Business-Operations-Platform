import type { BusinessSettings, PutBusinessSettingsRequest } from '@toobler-one/shared';
import { getCountries } from 'libphonenumber-js';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import * as accountsRepository from '../repositories/accounts.repository';

/**
 * The business's own settings: its time zone and the country a phone number belongs to when typed without a country code.
 * They live on the business itself (this module owns that table); the knowledge module's routes use this through
 * this module's index.ts. Other modules read the same two values from the signed-in person (`principal.timeZone`,
 * `principal.defaultCountry`), so they never read the business table.
 */
export function createBusinessSettingsService({ database }: { database: Database }) {
  return {
    /**
     * Changes the time zone and/or the default country. Only what is sent changes, and sending the value already set
     * changes nothing and writes no log line. A country that phone numbers do not exist for answers 400 INVALID_COUNTRY.
     * Answers with the settings as they now are.
     */
    async changeBusinessSettings(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: PutBusinessSettingsRequest,
    ): Promise<BusinessSettings> {
      if (request.timeZone === undefined && request.defaultCountry === undefined) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send a time zone or a default country.');
      }
      if (request.defaultCountry !== undefined && !(getCountries() as string[]).includes(request.defaultCountry)) {
        throw new ApiError(
          400,
          'INVALID_COUNTRY',
          'That is not a country phone numbers exist for. Use two letters, like IN.',
        );
      }

      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await accountsRepository.findAccountSettings(transaction, accountId);
        if (!current) throw notFound('The business');

        const changes: { timeZone?: string; defaultCountry?: string } = {};
        if (request.timeZone !== undefined && request.timeZone !== current.timeZone)
          changes.timeZone = request.timeZone;
        if (request.defaultCountry !== undefined && request.defaultCountry !== current.defaultCountry) {
          changes.defaultCountry = request.defaultCountry;
        }
        const changedFields = Object.keys(changes);
        if (changedFields.length === 0) return current;

        await accountsRepository.updateAccountSettings(transaction, accountId, changes);
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'business.settings_changed',
          // Which settings changed; the values are codes, but the log keeps to field names like every other line
          details: { recordType: 'business', recordId: accountId, fields: changedFields },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'business.settings_changed',
          payload: { fields: changedFields },
        });
        return { ...current, ...changes };
      });
    },
  };
}

export type BusinessSettingsService = ReturnType<typeof createBusinessSettingsService>;
