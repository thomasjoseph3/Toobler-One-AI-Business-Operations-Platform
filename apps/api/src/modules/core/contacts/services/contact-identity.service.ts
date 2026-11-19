import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import * as contactsRepository from '../repositories/contacts.repository';

// How the conversation engine finds or makes the contact for the person on the other end of a conversation. The functions take the
// caller's transaction, so they join the work the caller is doing and save or roll back with it.

/** Who is on the other end, as a channel saw them: a phone as digits only (the form contacts use) and/or an email in lower case. */
export interface ContactIdentity {
  phoneKey?: string | undefined;
  email?: string | undefined;
}

/** The id of the live contact with this phone or email (the phone wins when two different contacts match), or undefined. */
export async function findContactIdByIdentity(
  transaction: Db,
  options: { accountId: string } & ContactIdentity,
): Promise<string | undefined> {
  if (options.phoneKey !== undefined) {
    const byPhone = await contactsRepository.findContactIdByPhoneKey(transaction, options.accountId, options.phoneKey);
    if (byPhone) return byPhone;
  }
  if (options.email !== undefined) {
    return contactsRepository.findContactIdByEmail(transaction, options.accountId, options.email);
  }
  return undefined;
}

/**
 * Finds the contact for a person, or adds one (with only the phone and/or email, no name) when there is none. Returns null when the
 * channel knew neither a phone nor an email, because a contact must be reachable. A person who calls twice, or writes from a phone and
 * then an email that are both on file, is the same contact. Writes the activity-log line and the `contact.created` event when it adds one.
 */
export async function findOrCreateContactFromIdentity(
  transaction: Db,
  options: { accountId: string; actor: Actor } & ContactIdentity,
): Promise<{ contactId: string; created: boolean } | null> {
  if (options.phoneKey === undefined && options.email === undefined) return null;
  const existingId = await findContactIdByIdentity(transaction, options);
  if (existingId) return { contactId: existingId, created: false };

  const contactId = uuidv7();
  const wasAdded = await contactsRepository.insertContactIfFree(transaction, {
    id: contactId,
    accountId: options.accountId,
    phone: options.phoneKey === undefined ? null : `+${options.phoneKey}`,
    email: options.email ?? null,
    actor: options.actor,
  });
  if (!wasAdded) {
    // Someone added the same person a moment ago
    const addedByOther = await findContactIdByIdentity(transaction, options);
    return addedByOther ? { contactId: addedByOther, created: false } : null;
  }
  await writeActivityLog(transaction, {
    accountId: options.accountId,
    actor: options.actor,
    kind: 'contacts.created',
    // Which fields were filled in, never their values
    details: {
      recordType: 'contact',
      recordId: contactId,
      fields: [...(options.phoneKey === undefined ? [] : ['phone']), ...(options.email === undefined ? [] : ['email'])],
    },
  });
  await publishEvent(transaction, {
    accountId: options.accountId,
    eventName: 'contact.created',
    payload: { contactId },
  });
  return { contactId, created: true };
}

/**
 * Locks a live contact until the end of the transaction, so two things that change what a contact has (two conversations sorted at the
 * same moment, each wanting a lead) take turns. Returns false when there is no such live contact.
 */
export async function lockContactForUpdate(transaction: Db, accountId: string, contactId: string): Promise<boolean> {
  return (await contactsRepository.findContactForUpdate(transaction, accountId, contactId)) !== undefined;
}
