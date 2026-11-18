import {
  type DismissDuplicateResponse,
  type DuplicateObject,
  type DuplicateRecord,
  type DuplicatesListResponse,
  type DuplicateSuggestion,
  type FieldDefinition,
  type MergeDuplicateRequest,
  type MergeDuplicateResponse,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { AccountContext, Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { findPeopleSummaries } from '../../auth';
import { findCompaniesByIds, findCompaniesForDuplicateCheck, mergeCompanyInto, type CompanyRow } from '../../companies';
import { findCompanyNames } from '../../companies';
import { moveActivitiesToContact } from '../../activities';
import { moveConversationsToContact } from '../../conversations';
import {
  findContactsByIds,
  findContactsForDuplicateCheck,
  lockContactForUpdate,
  mergeContactInto,
  moveContactsToCompany,
} from '../../contacts';
import { findFieldDefinitions } from '../../fields';
import { contactHasOpenLead, moveLeadsToContact } from '../../leads';
import { moveListMembershipsToContact } from '../../lists';
import { moveTasksToContact } from '../../tasks';
import { moveTicketsToContact } from '../../tickets';
import {
  chooseMergedFields,
  customKeysFromMergedAway,
  otherSide,
  type MergeableFields,
} from '../helpers/choose-merged-values';
import { findDuplicateCompanyPairs, findDuplicateContactPairs } from '../helpers/find-duplicate-pairs';
import * as duplicatesRepository from '../repositories/duplicates.repository';
import type { DuplicateSuggestionRow } from '../repositories/duplicates.repository';

/** The answer for a pair someone has already decided (merged or dismissed). */
const alreadyDecided = () => conflict('ALREADY_DECIDED', 'This pair has already been dealt with.');

/** The answer when either record of a pair is no longer there (deleted, or merged into another since the pair was found). */
const recordGone = (object: DuplicateObject) =>
  notFound(object === 'contact' ? 'One of these contacts' : 'One of these companies');

/** One side of a contact pair, in the shape the screen shows. */
function toContactRecord(
  contact: Awaited<ReturnType<typeof findContactsByIds>>[number],
  companyNames: Map<string, string>,
  liveKeys: ReadonlySet<string>,
): DuplicateRecord {
  const custom: DuplicateRecord['custom'] = {};
  for (const [key, value] of Object.entries(contact.custom)) {
    if (liveKeys.has(key)) custom[key] = value;
  }
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    language: contact.language,
    lifecycleStage: contact.lifecycleStage,
    companyId: contact.companyId,
    companyName: contact.companyId ? (companyNames.get(contact.companyId) ?? null) : null,
    domain: null,
    city: null,
    ownerUserId: null,
    ownerName: null,
    custom,
    createdAt: contact.createdAt,
  };
}

/** One side of a company pair, in the shape the screen shows. */
function toCompanyRecord(
  company: CompanyRow,
  ownerNames: Map<string, string | null>,
  liveKeys: ReadonlySet<string>,
): DuplicateRecord {
  const custom: DuplicateRecord['custom'] = {};
  for (const [key, value] of Object.entries(company.custom)) {
    if (liveKeys.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      custom[key] = value;
    }
  }
  return {
    id: company.id,
    name: company.name,
    phone: company.phone,
    email: null,
    language: null,
    lifecycleStage: null,
    companyId: null,
    companyName: null,
    domain: company.domain,
    city: company.city,
    ownerUserId: company.ownerUserId,
    ownerName: company.ownerUserId ? (ownerNames.get(company.ownerUserId) ?? null) : null,
    custom,
    createdAt: company.createdAt.toISOString(),
  };
}

/** The fields of a record a merge compares. */
function toMergeableFields(record: DuplicateRecord): MergeableFields {
  return {
    name: record.name,
    phone: record.phone,
    email: record.email,
    language: record.language,
    lifecycleStage: record.lifecycleStage,
    companyId: record.companyId,
    domain: record.domain,
    city: record.city,
    ownerUserId: record.ownerUserId,
  };
}

/** Which fields of `take` may be sent for each kind of record. Anything else is refused (400). */
const TAKE_FIELDS: Record<DuplicateObject, string[]> = {
  contact: ['name', 'phone', 'email', 'language', 'lifecycleStage', 'company', 'custom'],
  company: ['name', 'phone', 'domain', 'city', 'owner', 'custom'],
};

/** Refuses (400) a choice for a field that this kind of record does not have, or for a custom field the business does not have. */
function checkChoices(object: DuplicateObject, request: MergeDuplicateRequest, liveFields: FieldDefinition[]): void {
  const allowed = new Set(TAKE_FIELDS[object]);
  for (const field of Object.keys(request.take)) {
    if (!allowed.has(field)) {
      throw new ApiError(400, 'INVALID_CHOICE', `A ${object} has no "${field}" to choose.`);
    }
  }
  const liveKeys = new Set(liveFields.map((field) => field.key));
  for (const key of Object.keys(request.take.custom ?? {})) {
    if (!liveKeys.has(key))
      throw new ApiError(400, 'INVALID_CHOICE', 'One of the custom fields is not one of your fields.');
  }
}

/**
 * Finds the pairs of one kind that look like one record, in the business's own transaction, and saves them. Runs nightly (a job), safe to run
 * twice: a dismissed pair is never made open again. Returns how many new pairs were found.
 */
export async function detectDuplicatesForBusiness(accountContext: AccountContext): Promise<number> {
  return accountContext.runInAccountTransaction(async (transaction) => {
    const { accountId, actor } = accountContext;
    const contacts = await findContactsForDuplicateCheck(transaction, accountId);
    const newContactPairs = await duplicatesRepository.saveFoundPairs(transaction, {
      accountId,
      object: 'contact',
      pairs: findDuplicateContactPairs(contacts),
      actor,
    });
    const companies = await findCompaniesForDuplicateCheck(transaction, accountId);
    const newCompanyPairs = await duplicatesRepository.saveFoundPairs(transaction, {
      accountId,
      object: 'company',
      pairs: findDuplicateCompanyPairs(companies),
      actor,
    });
    return newContactPairs + newCompanyPairs;
  });
}

/**
 * Everything about possible duplicates. The routes call this.
 * Repositories used: duplicates (in ../repositories). Reads and changes contacts, companies, leads, tasks, tickets, notes, conversations and
 * lists only through those modules' index files.
 */
export function createDuplicatesService({ database }: { database: Database }) {
  /** Builds the two sides of each pair, with the labels of the custom fields. Run inside the business's transaction. */
  async function describePairs(
    transaction: Db,
    accountId: string,
    object: DuplicateObject,
    rows: DuplicateSuggestionRow[],
  ): Promise<DuplicatesListResponse> {
    const fields = await findFieldDefinitions(transaction, accountId, object);
    const liveKeys = new Set(fields.map((field) => field.key));
    const ids = [...new Set(rows.flatMap((row) => [row.aId, row.bId]))];
    const recordsById = new Map<string, DuplicateRecord>();
    const openLeadById = new Map<string, boolean>();
    if (object === 'contact') {
      const contacts = await findContactsByIds(transaction, { accountId, contactIds: ids });
      const companyNames = await findCompanyNames(transaction, {
        accountId,
        companyIds: contacts.flatMap((contact) => (contact.companyId ? [contact.companyId] : [])),
      });
      for (const contact of contacts) {
        recordsById.set(contact.id, toContactRecord(contact, companyNames, liveKeys));
        openLeadById.set(contact.id, await contactHasOpenLead(transaction, accountId, contact.id));
      }
    } else {
      const companies = await findCompaniesByIds(transaction, { accountId, companyIds: ids });
      const owners = await findPeopleSummaries(transaction, {
        accountId,
        userIds: companies.flatMap((company) => (company.ownerUserId ? [company.ownerUserId] : [])),
      });
      const ownerNames = new Map(owners.map((owner) => [owner.id, owner.name]));
      for (const company of companies) recordsById.set(company.id, toCompanyRecord(company, ownerNames, liveKeys));
    }
    const items: DuplicateSuggestion[] = [];
    for (const row of rows) {
      const firstRecord = recordsById.get(row.aId);
      const secondRecord = recordsById.get(row.bId);
      if (firstRecord === undefined || secondRecord === undefined) continue; // a record went away since the list was read
      items.push({
        id: row.id,
        object,
        reasons: row.reasons,
        a: firstRecord,
        b: secondRecord,
        aHasOpenLead: openLeadById.get(row.aId) ?? false,
        bHasOpenLead: openLeadById.get(row.bId) ?? false,
        createdAt: row.createdAt.toISOString(),
      });
    }
    return { items, fields };
  }

  /** Moves everything a merged-away contact had to the kept contact, in the merge's own transaction. */
  async function moveEverythingOfContact(
    transaction: Db,
    options: { accountId: string; fromContactId: string; toContactId: string; actor: Actor },
  ): Promise<void> {
    await moveLeadsToContact(transaction, options);
    await moveTasksToContact(transaction, options);
    await moveTicketsToContact(transaction, options);
    await moveActivitiesToContact(transaction, options);
    await moveConversationsToContact(transaction, options);
    await moveListMembershipsToContact(transaction, options);
  }

  return {
    /** The open pairs of one kind (contacts or companies), both records still there, with each side's details and why they match. */
    async listDuplicates(
      principal: Pick<Principal, 'accountId'>,
      object: DuplicateObject,
    ): Promise<DuplicatesListResponse> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const rows = await duplicatesRepository.listOpenSuggestions(transaction, principal.accountId, object);
        return describePairs(transaction, principal.accountId, object, rows);
      });
    },

    /**
     * Says "Not the same": the pair is never suggested again. 404 for an unknown pair or another business's; 409 ALREADY_DECIDED when someone
     * already merged or dismissed it.
     */
    async dismissDuplicate(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      suggestionId: string,
    ): Promise<DismissDuplicateResponse> {
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const suggestion = await duplicatesRepository.findSuggestionForUpdate(
          transaction,
          principal.accountId,
          suggestionId,
        );
        if (!suggestion) throw notFound('That pair');
        if (suggestion.status !== 'open') throw alreadyDecided();
        await duplicatesRepository.markSuggestionDecided(transaction, {
          accountId: principal.accountId,
          suggestionId,
          status: 'dismissed',
          actor,
        });
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor,
          kind: 'duplicates.dismissed',
          details: { recordType: suggestion.object, recordId: suggestion.aId },
        });
        return { id: suggestionId, status: 'dismissed' as const };
      });
    },

    /**
     * Merges a pair into the record staff chose to keep. Everything the other record had (leads, tasks, notes and timeline, tickets, conversations,
     * lists, and for a company its people) moves to it, the other record is marked deleted and points at the kept one (both originals stay), and
     * the activity log records it. 404 for an unknown pair or when a record is gone; 409 ALREADY_DECIDED; 409 BOTH_HAVE_OPEN_LEADS (contacts);
     * 400 INVALID_CHOICE; 400 CONTACT_NEEDS_PHONE_OR_EMAIL.
     */
    async mergeDuplicate(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      suggestionId: string,
      request: MergeDuplicateRequest,
    ): Promise<MergeDuplicateResponse> {
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const suggestion = await duplicatesRepository.findSuggestionForUpdate(transaction, accountId, suggestionId);
        if (!suggestion) throw notFound('That pair');
        if (suggestion.status !== 'open') throw alreadyDecided();
        const { object } = suggestion;

        const fields = await findFieldDefinitions(transaction, accountId, object);
        checkChoices(object, request, fields);

        // Lock both records (always in the same order, so two merges cannot wait for each other) and read them
        if (object === 'contact') {
          for (const contactId of [suggestion.aId, suggestion.bId].sort()) {
            if (!(await lockContactForUpdate(transaction, accountId, contactId))) throw recordGone(object);
          }
        }
        const { items } = await describePairs(transaction, accountId, object, [suggestion]);
        const pair = items[0];
        if (!pair) throw recordGone(object);

        const keptId = request.keep === 'a' ? suggestion.aId : suggestion.bId;
        const mergedAwayId = request.keep === 'a' ? suggestion.bId : suggestion.aId;
        const merged = chooseMergedFields({ a: toMergeableFields(pair.a), b: toMergeableFields(pair.b), request });
        const mergedAwayCustomKeys = customKeysFromMergedAway(request);
        const mergedAwaySide = otherSide(request.keep);

        if (object === 'contact') {
          if (pair.aHasOpenLead && pair.bHasOpenLead) {
            throw conflict(
              'BOTH_HAVE_OPEN_LEADS',
              'Both people have an open lead. Close or delete one of the two leads first, then merge.',
            );
          }
          if (merged.phone === null && merged.email === null) {
            throw new ApiError(
              400,
              'CONTACT_NEEDS_PHONE_OR_EMAIL',
              'The merged contact needs a phone number or an email.',
            );
          }
          const wasMerged = await mergeContactInto(transaction, {
            accountId,
            keptId,
            mergedAwayId,
            values: {
              name: merged.name,
              phone: merged.phone,
              email: merged.email,
              language: merged.language,
              lifecycleStage: merged.lifecycleStage ?? 'new',
              companyId: merged.companyId,
              customKeysFromMergedAway: mergedAwayCustomKeys,
            },
            actor,
          });
          if (!wasMerged) throw recordGone(object);
          await moveEverythingOfContact(transaction, {
            accountId,
            fromContactId: mergedAwayId,
            toContactId: keptId,
            actor,
          });
        } else {
          const wasMerged = await mergeCompanyInto(transaction, {
            accountId,
            keptId,
            mergedAwayId,
            values: {
              name: merged.name ?? pair[mergedAwaySide].name ?? '',
              domain: merged.domain,
              phone: merged.phone,
              city: merged.city,
              ownerUserId: merged.ownerUserId,
              customKeysFromMergedAway: mergedAwayCustomKeys,
            },
            actor,
          });
          if (!wasMerged) throw recordGone(object);
          await moveContactsToCompany(transaction, {
            accountId,
            fromCompanyId: mergedAwayId,
            toCompanyId: keptId,
            actor,
          });
        }

        await duplicatesRepository.markSuggestionDecided(transaction, {
          accountId,
          suggestionId,
          status: 'merged',
          actor,
        });
        await duplicatesRepository.closeOpenSuggestionsAbout(transaction, {
          accountId,
          object,
          recordId: mergedAwayId,
          actor,
        });

        // The log keeps a line for each original: the field NAMES that were taken from the merged-away record, never the values
        const tookFromMergedAway = Object.entries(request.take)
          .filter(([field, side]) => field !== 'custom' && side === mergedAwaySide)
          .map(([field]) => field);
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: `${object === 'contact' ? 'contacts' : 'companies'}.merged`,
          details: { recordType: object, recordId: keptId, fields: [...tookFromMergedAway, ...mergedAwayCustomKeys] },
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: `${object === 'contact' ? 'contacts' : 'companies'}.merged_away`,
          details: { recordType: object, recordId: mergedAwayId },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: `${object}.merged`,
          payload: { keptId, mergedAwayId },
        });
        return { object, keptId, mergedAwayId };
      });
    },
  };
}
