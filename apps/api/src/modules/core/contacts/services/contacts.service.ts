import type { Contact, ContactsListResponse, CreateContactRequest, ListContactsQuery } from '@toobler-one/shared';
import type { CountryCode } from 'libphonenumber-js';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import type { Principal } from '../../../../kernel/http/guard';
import { parsePhone } from '../../../../kernel/phone';
import { readSearchText } from '../helpers/contact-search';
import * as contactsRepository from '../repositories/contacts.repository';

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
