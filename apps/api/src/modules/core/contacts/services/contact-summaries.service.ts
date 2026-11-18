import type { Contact } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
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
