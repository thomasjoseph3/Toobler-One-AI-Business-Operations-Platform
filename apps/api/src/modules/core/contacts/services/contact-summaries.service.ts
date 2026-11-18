import { customFieldsToFilterable, type Contact, type LifecycleStage } from '@toobler-one/shared';
import { readFilterRequest } from '../../../../kernel/filters/read-filter-request';
import { findFieldDefinitions } from '../../fields';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { readSearchText } from '../helpers/contact-search';
import * as contactsRepository from '../repositories/contacts.repository';

/** The few facts about a contact that another module (leads) shows next to its own records. */
export interface ContactSummary {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * The live contacts among these ids, as short summaries. A deleted contact, an unknown id and another business's contact
 * are simply missing from the answer. Used by the leads module (through this module's index.ts) to show who a lead is for.
 */
export async function findContactSummaries(
  transaction: Db,
  options: { accountId: string; contactIds: string[] },
): Promise<ContactSummary[]> {
  const contacts = await contactsRepository.findContactsByIds(transaction, options.accountId, options.contactIds);
  return contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
  }));
}

/**
 * Which live contacts belong to which of these companies. Used by the companies module (through this module's index.ts) to count a company's
 * people and to find their leads. Run it inside the business's own transaction.
 */
export async function findContactCompanyLinks(
  transaction: Db,
  options: { accountId: string; companyIds: string[] },
): Promise<Array<{ contactId: string; companyId: string }>> {
  return contactsRepository.findContactCompanyLinks(transaction, options.accountId, options.companyIds);
}

/** The live contacts of one company, by name. Used by the companies module (through this module's index.ts) for the company page. Run it inside the business's own transaction. */
export async function findContactsOfCompany(
  transaction: Db,
  options: { accountId: string; companyId: string },
): Promise<Contact[]> {
  return contactsRepository.findContactsOfCompany(transaction, options.accountId, options.companyId);
}

/**
 * Puts a contact in a company, or takes it out with `null`. Returns the contact as it is now and the company it was in before, or undefined when
 * there is no such live contact (also for another business's contact). The caller has already checked the company belongs to the business. Used by
 * the companies module (through this module's index.ts). Run it inside the business's own transaction.
 */
export async function setContactCompany(
  transaction: Db,
  options: { accountId: string; contactId: string; companyId: string | null; actor: Actor },
): Promise<{ contact: Contact; previousCompanyId: string | null } | undefined> {
  const before = await contactsRepository.findContactForUpdate(transaction, options.accountId, options.contactId);
  if (!before) return undefined;
  const contact = await contactsRepository.setContactCompany(transaction, options);
  return contact ? { contact, previousCompanyId: before.companyId } : undefined;
}

/** Takes every contact out of a company that is being deleted. Returns how many were let go. Used by the companies module. Run it inside the business's own transaction. */
export async function clearCompanyOfContacts(
  transaction: Db,
  options: { accountId: string; companyId: string; actor: Actor },
): Promise<number> {
  return contactsRepository.clearCompanyOfContacts(transaction, options);
}

/**
 * Puts a contact in a company only if it is not in one yet (what the AI heard never overrides what staff chose). Returns whether it was put in.
 * Used by the agents module (through this module's index.ts). Run it inside the business's own transaction.
 */
export async function setContactCompanyIfNone(
  transaction: Db,
  options: { accountId: string; contactId: string; companyId: string; actor: Actor },
): Promise<boolean> {
  return contactsRepository.setContactCompanyIfNone(transaction, options);
}

/**
 * Adds what the AI heard for the business's custom contact fields to a contact, only for fields it has no answer for yet. The caller has already
 * checked the answers. Used by the agents module (through this module's index.ts); run it inside the business's own transaction.
 */
export async function addCustomAnswersToContactWhereEmpty(
  transaction: Db,
  options: { accountId: string; contactId: string; answers: Record<string, unknown>; actor: Actor },
): Promise<boolean> {
  if (Object.keys(options.answers).length === 0) return false;
  return contactsRepository.addCustomAnswersWhereEmpty(transaction, options);
}

/**
 * The people whose name, email or phone match what was typed in the search box (the same rule as the contacts list: three or more digits are a phone
 * number, however it was typed), most recently changed first, at most `limit`. Blank text finds nobody. Used by the search module (through this
 * module's index.ts). Run it inside the business's own transaction.
 */
export async function findContactsMatchingText(
  transaction: Db,
  options: { accountId: string; text: string; limit: number },
): Promise<ContactSummary[]> {
  const search = readSearchText(options.text);
  if (search === null) return [];
  const { items } = await contactsRepository.listContacts(transaction, options.accountId, {
    search,
    lifecycleStage: undefined,
    limit: options.limit,
    offset: 0,
  });
  return items.map((contact) => ({ id: contact.id, name: contact.name, phone: contact.phone, email: contact.email }));
}

/** What a contacts view is made of: the search text, a lifecycle stage and the filter engine's `filters` text (the same words the contacts list takes). */
export interface ContactsViewSelection {
  q?: string | undefined;
  lifecycleStage?: LifecycleStage | undefined;
  filters?: string | undefined;
}

/**
 * The ids of the live contacts that match a contacts view right now (at most `limit`, newest change first), for a static list made from a view. The
 * conditions are checked by the same filter reader as the contacts list, so a bad filter is 400 INVALID_FILTERS. Used by the lists module (through this
 * module's index.ts). Run it inside the business's own transaction.
 */
export async function findContactIdsMatchingView(
  transaction: Db,
  options: { accountId: string; view: ContactsViewSelection; limit: number },
): Promise<string[]> {
  const definitions = await findFieldDefinitions(transaction, options.accountId, 'contact');
  const conditions = readFilterRequest(options.view.filters, customFieldsToFilterable(definitions));
  const { items } = await contactsRepository.listContacts(transaction, options.accountId, {
    search: readSearchText(options.view.q),
    lifecycleStage: options.view.lifecycleStage,
    conditions,
    limit: options.limit,
    offset: 0,
  });
  return items.map((contact) => contact.id);
}

/** Which of these ids are live contacts of the business (an unknown id, a deleted contact and another business's contact are missing from the answer). */
export async function findLiveContactIds(
  transaction: Db,
  options: { accountId: string; contactIds: string[] },
): Promise<string[]> {
  const contacts = await contactsRepository.findContactsByIds(transaction, options.accountId, options.contactIds);
  return contacts.map((contact) => contact.id);
}
