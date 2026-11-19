import type { Db } from '../../../../kernel/database';
import * as leadsRepository from '../repositories/leads.repository';

/** What a person's leads add up to. */
export interface ContactLeadTotals {
  contactId: string;
  openLeads: number;
  wonLeads: number;
  /** The combined budget of the won leads, in paise. */
  wonValuePaise: number;
}

/**
 * For each of these contacts: how many open and won leads they have, and the combined budget of the won ones. Contacts with no leads are
 * missing from the answer. For the "own leads only" role (`visibleToUserId`) only the leads that person owns are added up. Used by the companies module (through this module's index.ts) to add up a company's people. Run it inside the
 * business's own transaction.
 */
export async function findLeadTotalsForContacts(
  transaction: Db,
  options: { accountId: string; contactIds: string[]; visibleToUserId?: string },
): Promise<ContactLeadTotals[]> {
  return leadsRepository.summariseLeadsOfContacts(
    transaction,
    options.accountId,
    options.contactIds,
    options.visibleToUserId,
  );
}

/** One lead as another module shows it in a list: where it stands, what it is about, its budget and who looks after it. */
export interface LeadListEntry {
  id: string;
  contactId: string;
  stageName: string;
  stageKind: 'open' | 'won' | 'lost';
  interest: string | null;
  budgetPaise: number | null;
  ownerUserId: string | null;
  createdAt: Date;
}

/**
 * The live leads of these contacts, newest first. For the "own leads only" role (`visibleToUserId`) only the leads that person owns are
 * returned, so a company page never shows them another person's lead. Used by the companies module (through this module's index.ts).
 * Run it inside the business's own transaction.
 */
export async function findLeadsOfContacts(
  transaction: Db,
  options: { accountId: string; contactIds: string[]; visibleToUserId?: string },
): Promise<LeadListEntry[]> {
  const rows = await leadsRepository.listLeadsOfContacts(transaction, options);
  return rows.map((row) => ({
    id: row.id,
    contactId: row.contactId,
    stageName: row.stageName,
    stageKind: row.stageKind,
    interest: row.interest,
    budgetPaise: row.budgetPaise,
    ownerUserId: row.ownerUserId,
    createdAt: row.createdAt,
  }));
}
