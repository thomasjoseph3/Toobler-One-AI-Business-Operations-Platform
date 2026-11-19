import type { PatchWebchatSettingsRequest, WebchatSettings } from '@toobler-one/shared';
import type { CountryCode } from 'libphonenumber-js';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { parsePhone } from '../../../../kernel/phone';
import { describeWebchatSettings, type StoredWebchatSettings } from '../helpers/describe-webchat-settings';
import { makeWidgetKey } from '../helpers/widget-key';
import { readWebsiteOrigins } from '../helpers/website-origin';
import * as webchatSettingsRepository from '../repositories/webchat-settings.repository';
import type { WebchatSettingsChanges } from '../repositories/webchat-settings.repository';

/** The module's own actor for what it makes by itself (the first settings row). */
const MODULE_ACTOR: Actor = { kind: 'system', id: 'channel.webchat' };

/** True when two lists hold the same texts in the same order. */
function sameList(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((item, position) => item === second[position]);
}

/** Reads a typed phone number into its international form, or says what is wrong. */
function readPhoneNumber(typed: string, defaultCountry: string, label: string): string {
  const parsed = parsePhone(typed, defaultCountry as CountryCode);
  if (!parsed) {
    throw new ApiError(
      400,
      'INVALID_PHONE_NUMBER',
      `The ${label} is not a phone number. Write it with its country code, like +91 98470 12345.`,
    );
  }
  return parsed.e164;
}

/**
 * The settings of the website chat bubble. A business's settings are made the first time they are read, with a new random widget key and
 * no allowed website (the chat works nowhere until the business lists its site). The business always comes from the signed-in person.
 */
export function createWebchatSettingsService(input: { database: Database; publicBaseUrl: string }) {
  const { database, publicBaseUrl } = input;

  /** The business's settings, made first when there are none. Runs in the caller's fenced transaction. */
  async function readOrMakeSettings(
    transaction: Parameters<typeof webchatSettingsRepository.findSettings>[0],
    accountId: string,
  ): Promise<StoredWebchatSettings> {
    const found = await webchatSettingsRepository.findSettings(transaction, accountId);
    if (found) return found;
    await webchatSettingsRepository.insertSettingsIfMissing(transaction, {
      accountId,
      widgetKey: makeWidgetKey(),
      actor: MODULE_ACTOR,
    });
    const made = await webchatSettingsRepository.findSettings(transaction, accountId);
    if (!made) throw new Error('The chat settings could not be made');
    return made;
  }

  return {
    /** The settings, the key, the code to paste and "last seen". Makes them the first time. */
    async readSettings(principal: Pick<Principal, 'accountId'>): Promise<WebchatSettings> {
      const stored = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        readOrMakeSettings(transaction, principal.accountId),
      );
      return describeWebchatSettings(stored, publicBaseUrl);
    },

    /**
     * Changes the settings. Only what is sent changes, and sending what is already set changes nothing and writes nothing. A website is
     * tidied to its address without a page; a number is read in the business's own country when typed without one. Answers 400 with a clear
     * message for a website, a number or a button list that cannot be used. Answers with the settings as they now are.
     */
    async changeSettings(
      principal: Pick<Principal, 'accountId' | 'userId' | 'defaultCountry'>,
      request: PatchWebchatSettingsRequest,
    ): Promise<WebchatSettings> {
      if (Object.values(request).every((value) => value === undefined)) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send at least one setting to change.');
      }
      const wanted: WebchatSettingsChanges = {};
      if (request.colour !== undefined) wanted.colour = request.colour.toUpperCase();
      if (request.greeting !== undefined) wanted.greeting = request.greeting;
      if (request.position !== undefined) wanted.position = request.position;
      if (request.allowedWebsites !== undefined) {
        const websites = readWebsiteOrigins(request.allowedWebsites);
        if (!websites.ok) throw new ApiError(400, 'INVALID_WEBSITE', websites.problem);
        wanted.allowedWebsites = websites.origins;
      }
      if (request.phoneNumber !== undefined) {
        wanted.phoneNumber =
          request.phoneNumber === null
            ? null
            : readPhoneNumber(request.phoneNumber, principal.defaultCountry, 'phone number');
      }
      if (request.whatsappNumber !== undefined) {
        wanted.whatsappNumber =
          request.whatsappNumber === null
            ? null
            : readPhoneNumber(request.whatsappNumber, principal.defaultCountry, 'WhatsApp number');
      }
      if (request.whatsappMessage !== undefined) wanted.whatsappMessage = request.whatsappMessage;
      if (request.buttonOrder !== undefined) {
        if (new Set(request.buttonOrder).size !== request.buttonOrder.length) {
          throw new ApiError(400, 'INVALID_BUTTONS', 'List each button once.');
        }
        if (!request.buttonOrder.includes('chat')) {
          throw new ApiError(400, 'INVALID_BUTTONS', 'The chat button must stay: it is the point of the bubble.');
        }
        wanted.buttonOrder = request.buttonOrder;
      }

      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const stored = await database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await readOrMakeSettings(transaction, accountId);
        // Only what really differs is changed
        const changes: WebchatSettingsChanges = {};
        if (wanted.colour !== undefined && wanted.colour !== current.colour.toUpperCase())
          changes.colour = wanted.colour;
        if (wanted.greeting !== undefined && wanted.greeting !== current.greeting) changes.greeting = wanted.greeting;
        if (wanted.position !== undefined && wanted.position !== current.position) changes.position = wanted.position;
        if (wanted.allowedWebsites !== undefined && !sameList(wanted.allowedWebsites, current.allowedWebsites)) {
          changes.allowedWebsites = wanted.allowedWebsites;
        }
        if (wanted.phoneNumber !== undefined && wanted.phoneNumber !== current.phoneNumber)
          changes.phoneNumber = wanted.phoneNumber;
        if (wanted.whatsappNumber !== undefined && wanted.whatsappNumber !== current.whatsappNumber) {
          changes.whatsappNumber = wanted.whatsappNumber;
        }
        if (wanted.whatsappMessage !== undefined && wanted.whatsappMessage !== current.whatsappMessage) {
          changes.whatsappMessage = wanted.whatsappMessage;
        }
        if (wanted.buttonOrder !== undefined && !sameList(wanted.buttonOrder, current.buttonOrder)) {
          changes.buttonOrder = wanted.buttonOrder;
        }
        const changedFields = Object.keys(changes);
        if (changedFields.length === 0) return current;

        await webchatSettingsRepository.updateSettings(transaction, { accountId, changes, actor });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'webchat.settings_changed',
          // Which settings changed, never their values (a number is personal data)
          details: { recordType: 'webchat_settings', recordId: accountId, fields: changedFields },
        });
        const after = await webchatSettingsRepository.findSettings(transaction, accountId);
        if (!after) throw new Error('The chat settings disappeared');
        return after;
      });
      return describeWebchatSettings(stored, publicBaseUrl);
    },
  };
}

export type WebchatSettingsService = ReturnType<typeof createWebchatSettingsService>;
