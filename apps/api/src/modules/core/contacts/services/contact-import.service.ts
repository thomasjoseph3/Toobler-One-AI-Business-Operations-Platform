import {
  validateCustomValues,
  type FieldDefinition,
  type ImportSkipReason,
  type ReadImportRow,
} from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { uuidv7 } from '../../../../kernel/ids';
import { mergeCustomAnswers } from '../../fields';
import { readImportedIdentity, type ImportedIdentity } from '../helpers/import-row';
import * as contactsRepository from '../repositories/contacts.repository';
import { findContactIdByIdentity } from './contact-identity.service';

// What a spreadsheet row does to the contacts (F12). It matches a person the same way the AI does (the phone, then the email), so a row never makes a
// duplicate and importing the same file twice changes nothing the second time. The functions take the caller's transaction and join it.

/** A row that was skipped, with the kind of problem and a sentence for the report. */
export interface SkippedImport {
  kind: 'skipped';
  reason: ImportSkipReason;
  message: string;
}

/** What a row would do, without doing it (for the counts shown before the run). `identityKeys` lets the caller see the same person twice in one file. */
export type ImportPreview = { kind: 'new' | 'matched'; identityKeys: string[] } | SkippedImport;

/** What a row did. */
export type ImportApplied = { kind: 'created' | 'matched'; contactId: string } | SkippedImport;

/** The row read as a person, or the reason it is skipped. Phone, email, language and every custom answer are checked here. */
function checkRow(
  row: ReadImportRow,
  defaultCountry: string,
  definitions: readonly FieldDefinition[],
): { ok: true; identity: ImportedIdentity; custom: Record<string, string | number | boolean> } | SkippedImport {
  const identity = readImportedIdentity(row, defaultCountry);
  if ('skipped' in identity && identity.skipped) {
    return { kind: 'skipped', reason: identity.reason, message: identity.message };
  }
  const { values, problems } = validateCustomValues(definitions, row.custom);
  const firstProblem = problems[0];
  if (firstProblem) return { kind: 'skipped', reason: 'invalid_custom', message: firstProblem.message };
  const custom: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(values)) if (value !== null) custom[key] = value;
  return { ok: true, identity: identity as ImportedIdentity, custom };
}

/** The keys that stand for this person in a file (the phone digits, the email), so the same person twice in one file is seen as one. */
function identityKeysOf(identity: ImportedIdentity): string[] {
  return [
    ...(identity.phone ? [`phone:${identity.phone.key}`] : []),
    ...(identity.email ? [`email:${identity.email}`] : []),
  ];
}

/** Says what this row would do, without changing anything: a new contact, a match with someone already there, or a skipped row. */
export async function previewImportedContact(
  transaction: Db,
  options: { accountId: string; defaultCountry: string; row: ReadImportRow; definitions: readonly FieldDefinition[] },
): Promise<ImportPreview> {
  const checked = checkRow(options.row, options.defaultCountry, options.definitions);
  if (!('ok' in checked)) return checked;
  const existingId = await findContactIdByIdentity(transaction, {
    accountId: options.accountId,
    ...(checked.identity.phone ? { phoneKey: checked.identity.phone.key } : {}),
    ...(checked.identity.email ? { email: checked.identity.email } : {}),
  });
  return { kind: existingId ? 'matched' : 'new', identityKeys: identityKeysOf(checked.identity) };
}

/**
 * Saves one row. A person who is not there yet is added, marked as imported. A person who is there (matched by the phone, then the email) is updated and never
 * duplicated: what the file has fills in what the contact is missing (a name, a phone, an email, a language), and the custom answers in the file are set; a name or
 * a detail the contact already has is never replaced. A phone or an email that belongs to a DIFFERENT contact is left out, never moved. Returns what happened.
 */
export async function applyImportedContact(
  transaction: Db,
  options: {
    accountId: string;
    defaultCountry: string;
    actor: Actor;
    row: ReadImportRow;
    definitions: readonly FieldDefinition[];
    importedAt: Date;
  },
): Promise<ImportApplied> {
  const { accountId, actor, row } = options;
  const checked = checkRow(row, options.defaultCountry, options.definitions);
  if (!('ok' in checked)) return checked;
  const { identity, custom } = checked;
  const lookup = {
    accountId,
    ...(identity.phone ? { phoneKey: identity.phone.key } : {}),
    ...(identity.email ? { email: identity.email } : {}),
  };

  let contactId = await findContactIdByIdentity(transaction, lookup);
  if (!contactId) {
    const newId = uuidv7();
    const wasAdded = await contactsRepository.insertImportedContactIfFree(transaction, {
      id: newId,
      accountId,
      name: row.name ?? null,
      phone: identity.phone?.e164 ?? null,
      email: identity.email,
      language: identity.language,
      custom: mergeCustomAnswers({}, custom),
      importedAt: options.importedAt,
      actor,
    });
    if (wasAdded) return { kind: 'created', contactId: newId };
    // Someone added the same person a moment ago (or the phone is one contact's and the email another's): take the one that is there now
    contactId = await findContactIdByIdentity(transaction, lookup);
    if (!contactId)
      return { kind: 'skipped', reason: 'invalid_phone', message: 'The phone number or email could not be saved.' };
  }

  // The person is already there: fill in what is missing and set the custom answers from the file
  const current = await contactsRepository.findContactForUpdate(transaction, accountId, contactId);
  if (!current) return { kind: 'skipped', reason: 'no_contact_point', message: 'The contact no longer exists.' };
  const changes: contactsRepository.ContactChanges = {};
  if (current.name === null && row.name !== undefined) changes.name = row.name;
  if (current.language === null && identity.language !== null) changes.language = identity.language;
  if (current.phone === null && identity.phone) {
    const phoneOwner = await contactsRepository.findContactIdByPhoneKey(transaction, accountId, identity.phone.key);
    if (!phoneOwner) changes.phone = identity.phone.e164;
  }
  if (current.email === null && identity.email) {
    const emailOwner = await contactsRepository.findContactIdByEmail(transaction, accountId, identity.email);
    if (!emailOwner) changes.email = identity.email;
  }
  if (Object.keys(custom).length > 0) {
    const merged = mergeCustomAnswers(current.custom, custom);
    if (JSON.stringify(merged) !== JSON.stringify(current.custom)) changes.custom = merged;
  }
  if (Object.keys(changes).length > 0)
    await contactsRepository.updateContact(transaction, accountId, contactId, changes, actor);
  return { kind: 'matched', contactId };
}
