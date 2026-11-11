import type {
  Contact,
  ContactsListResponse,
  CreateContactRequest,
  ListContactsQuery,
  UpdateContactRequest,
} from '@toobler-one/shared';
import type { CountryCode } from 'libphonenumber-js';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import type { Principal } from '../../../../kernel/http/guard';
import { parsePhone } from '../../../../kernel/phone';
import { readSearchText } from '../helpers/contact-search';
import { computeLifecycleStage } from '../helpers/lifecycle';
import * as contactsRepository from '../repositories/contacts.repository';
import type { ContactChanges } from '../repositories/contacts.repository';

// The country a phone number belongs to when it is typed without a country code. India until each business has its own
// setting (F16 business profile), and then it follows the business.
const DEFAULT_COUNTRY: CountryCode = 'IN';

// The database error code for "a unique rule was broken", and the names of the two unique indexes, so we know which one.
const UNIQUE_VIOLATION = '23505';
const PHONE_INDEX = 'contacts_phone_unique';
const EMAIL_INDEX = 'contacts_email_unique';

/** The answer for a phone or email that a live contact already has. Names only that contact's id. */
const contactExists = (contactId: string) =>
  conflict('CONTACT_EXISTS', 'A contact with this phone number or email already exists.', { contactId });

/**
 * Everything about a business's contacts. The routes call this.
 * Repositories used: contacts (in ../repositories).
 */
export function createContactsService({ database }: { database: Database }) {
  return {
    /**
     * Adds a contact for the signed-in person's business. Needs a phone or an email. The phone is stored in international
     * form. If a live contact already has the phone or the email, answers 409 naming that contact (the phone match wins
     * when two different contacts match). Two requests at the same moment cannot both succeed: the database's unique
     * rules decide, and the loser gets the same 409.
     */
    async createContact(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateContactRequest,
    ): Promise<Contact> {
      if (request.phone === undefined && request.email === undefined) {
        throw new ApiError(400, 'PHONE_OR_EMAIL_REQUIRED', 'Add a phone number or an email address.');
      }
      let phone: ReturnType<typeof parsePhone> = null;
      if (request.phone !== undefined) {
        phone = parsePhone(request.phone, DEFAULT_COUNTRY);
        if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Enter a valid phone number, like +91 98470 12345.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Look first, so the common case answers cleanly; the unique indexes below still guard the race
          if (phone) {
            const existingId = await contactsRepository.findContactIdByPhoneKey(transaction, accountId, phone.key);
            if (existingId) throw contactExists(existingId);
          }
          if (request.email !== undefined) {
            const existingId = await contactsRepository.findContactIdByEmail(transaction, accountId, request.email);
            if (existingId) throw contactExists(existingId);
          }
          const contact = await contactsRepository.insertContact(transaction, {
            id: uuidv7(),
            accountId,
            name: request.name ?? null,
            phone: phone?.e164 ?? null,
            email: request.email ?? null,
            language: request.language ?? null,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'contacts.created',
            // Which fields were filled in, never their values
            details: {
              recordType: 'contact',
              recordId: contact.id,
              fields: Object.keys(request).filter(
                (field) => request[field as keyof CreateContactRequest] !== undefined,
              ),
            },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'contact.created',
            payload: { contactId: contact.id },
          });
          return contact;
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Someone else added the same phone or email a moment ago. The failed transaction is gone, so look in a new one.
        const existingId = await database.runInAccountTransaction(accountId, async (transaction) => {
          const byPhone = phone
            ? await contactsRepository.findContactIdByPhoneKey(transaction, accountId, phone.key)
            : undefined;
          if (byPhone) return byPhone;
          return request.email !== undefined
            ? contactsRepository.findContactIdByEmail(transaction, accountId, request.email)
            : undefined;
        });
        if (existingId) throw contactExists(existingId);
        throw error;
      }
    },

    /** One contact of the business. A deleted contact, an unknown id and another business's contact all answer 404. */
    async getContact(principal: Pick<Principal, 'accountId'>, contactId: string): Promise<Contact> {
      const contact = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        contactsRepository.findContactById(transaction, principal.accountId, contactId),
      );
      if (!contact) throw notFound('That contact');
      return contact;
    },

    /**
     * Changes the fields that were sent and answers with the contact. A phone is read with the same rules as when adding;
     * the contact must keep a phone or an email; a phone or email that another live contact has answers 409 naming that
     * contact. Sending what is already stored changes nothing (no log line, no event). `notAFit` marks or unmarks the
     * contact; unmarking only affects a contact that was marked, and returns it to the stage its facts give.
     */
    async updateContact(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      contactId: string,
      request: UpdateContactRequest,
    ): Promise<Contact> {
      if (Object.values(request).every((value) => value === undefined)) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send at least one field to change.');
      }
      let phone: ReturnType<typeof parsePhone> = null;
      if (typeof request.phone === 'string') {
        phone = parsePhone(request.phone, DEFAULT_COUNTRY);
        if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Enter a valid phone number, like +91 98470 12345.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const current = await contactsRepository.findContactForUpdate(transaction, accountId, contactId);
          if (!current) throw notFound('That contact');

          // What the contact would look like: a field not sent stays as it is, `null` clears it
          const changes: ContactChanges = {};
          if (request.name !== undefined && request.name !== current.name) changes.name = request.name;
          if (request.language !== undefined && request.language !== current.language)
            changes.language = request.language;
          if (request.email !== undefined && request.email !== current.email) changes.email = request.email;
          if (request.phone === null && current.phone !== null) changes.phone = null;
          if (phone && phone.e164 !== current.phone) changes.phone = phone.e164;
          if (request.notAFit === true && current.lifecycleStage !== 'not_a_fit') changes.lifecycleStage = 'not_a_fit';
          if (request.notAFit === false && current.lifecycleStage === 'not_a_fit') {
            // Until leads exist (F06) there are no facts, so the contact goes back to `new`
            changes.lifecycleStage = computeLifecycleStage({ markedNotAFit: false, openLeads: 0, wonLeads: 0 });
          }
          const changedFields = Object.keys(changes); // the names of the fields that really change
          if (changedFields.length === 0) return current;

          const phoneAfter = 'phone' in changes ? changes.phone : current.phone;
          const emailAfter = 'email' in changes ? changes.email : current.email;
          if (!phoneAfter && !emailAfter) {
            throw new ApiError(400, 'PHONE_OR_EMAIL_REQUIRED', 'A contact needs a phone number or an email address.');
          }
          // Look first, so the common case answers cleanly; the unique indexes still guard the race
          if (changes.phone && phone) {
            const existingId = await contactsRepository.findContactIdByPhoneKey(transaction, accountId, phone.key);
            if (existingId && existingId !== contactId) throw contactExists(existingId);
          }
          if (changes.email) {
            const existingId = await contactsRepository.findContactIdByEmail(transaction, accountId, changes.email);
            if (existingId && existingId !== contactId) throw contactExists(existingId);
          }

          const updated = await contactsRepository.updateContact(transaction, accountId, contactId, changes, actor);
          if (!updated) throw notFound('That contact');
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'contacts.updated',
            // Which fields changed, never their values
            details: { recordType: 'contact', recordId: contactId, fields: changedFields },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'contact.updated',
            payload: { contactId, fields: changedFields },
          });
          return updated;
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Another request took this phone or email a moment ago. The failed transaction is gone, so look in a new one.
        const existingId = await database.runInAccountTransaction(accountId, async (transaction) => {
          const byPhone = phone
            ? await contactsRepository.findContactIdByPhoneKey(transaction, accountId, phone.key)
            : undefined;
          if (byPhone && byPhone !== contactId) return byPhone;
          return typeof request.email === 'string'
            ? contactsRepository.findContactIdByEmail(transaction, accountId, request.email)
            : undefined;
        });
        if (existingId && existingId !== contactId) throw contactExists(existingId);
        throw error;
      }
    },

    /** One page of the business's contacts: search by name, email or phone digits, optional stage filter, newest change first. */
    async listContacts(
      principal: Pick<Principal, 'accountId'>,
      query: ListContactsQuery,
    ): Promise<ContactsListResponse> {
      const { items, total } = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        contactsRepository.listContacts(transaction, principal.accountId, {
          search: readSearchText(query.q),
          lifecycleStage: query.lifecycleStage,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
        }),
      );
      return { items, total, page: query.page, limit: query.limit };
    },
  };
}

export type ContactsService = ReturnType<typeof createContactsService>;

/** Whether an error is the database saying a contact's phone or email is already taken. */
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error) || error.code !== UNIQUE_VIOLATION) return false;
  const constraint = 'constraint' in error ? String(error.constraint) : '';
  return constraint === PHONE_INDEX || constraint === EMAIL_INDEX;
}
