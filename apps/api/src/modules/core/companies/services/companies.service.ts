import type { CountryCode } from 'libphonenumber-js';
import {
  isFreeMailDomain,
  type CompaniesListResponse,
  type Company,
  type CompanyDetail,
  type Contact,
  type CreateCompanyRequest,
  type ListCompaniesQuery,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import { parsePhone } from '../../../../kernel/phone';
import { findPeopleSummaries } from '../../auth';
import { findContactCompanyLinks, findContactsOfCompany, setContactCompany } from '../../contacts';
import { findLeadsOfContacts, findLeadTotalsForContacts } from '../../leads';
import { makeCompanyNameKey } from '../helpers/company-name';
import * as companiesRepository from '../repositories/companies.repository';
import type { CompanyRow } from '../repositories/companies.repository';

// The database error code for "a unique rule was broken", and the names of the two unique indexes, so we know which one.
const UNIQUE_VIOLATION = '23505';
const DOMAIN_INDEX = 'companies_domain_unique';
// The database error code for "a foreign key points at nothing" (here: an owner who does not work for the business).
const FOREIGN_KEY_VIOLATION = '23503';

/** The answer for a name that a live company already has. Names only that company's id. */
const nameExists = (companyId: string | undefined) =>
  conflict('COMPANY_EXISTS', 'A company with this name already exists.', { companyId });

/** The answer for a work domain that a live company already has. */
const domainExists = (companyId: string | undefined) =>
  conflict('COMPANY_DOMAIN_EXISTS', 'A company with this website domain already exists.', { companyId });

/**
 * Fills in the numbers and the owner's name for some companies: how many contacts, how many open leads and the combined budget of won leads of
 * their people. All worked out in code from the contacts and the leads. Run it inside the business's own transaction.
 */
export async function describeCompanies(
  transaction: Db,
  accountId: string,
  rows: CompanyRow[],
  visibleToUserId?: string,
): Promise<Company[]> {
  const links = await findContactCompanyLinks(transaction, { accountId, companyIds: rows.map((row) => row.id) });
  const totals = await findLeadTotalsForContacts(transaction, {
    accountId,
    contactIds: links.map((link) => link.contactId),
    ...(visibleToUserId ? { visibleToUserId } : {}),
  });
  const owners = await findPeopleSummaries(transaction, {
    accountId,
    userIds: rows.flatMap((row) => (row.ownerUserId ? [row.ownerUserId] : [])),
  });
  return rows.map((row) => {
    const contactIds = links.filter((link) => link.companyId === row.id).map((link) => link.contactId);
    const companyTotals = totals.filter((total) => contactIds.includes(total.contactId));
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      phone: row.phone,
      city: row.city,
      owner: row.ownerUserId
        ? { userId: row.ownerUserId, name: owners.find((owner) => owner.id === row.ownerUserId)?.name ?? null }
        : null,
      contactCount: contactIds.length,
      openLeads: companyTotals.reduce((sum, total) => sum + total.openLeads, 0),
      wonValuePaise: companyTotals.reduce((sum, total) => sum + total.wonValuePaise, 0),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/** Turns a typed search into an "contains" pattern for the database, with the special characters escaped. */
function makeSearchPattern(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return `%${text.replace(/[\\%_]/gu, (character) => `\\${character}`)}%`;
}

/** For the "own leads only" role, the person whose leads may be counted and listed; nobody for everyone else. */
function visibleLeadsOf(principal: Pick<Principal, 'role' | 'userId'>): string | undefined {
  return principal.role === 'staff_own' ? principal.userId : undefined;
}

/**
 * Everything about a business's companies. The routes call this.
 * Repositories used: companies (in ../repositories). Reads contacts, leads and people only through their modules' index files.
 */
export function createCompaniesService({ database }: { database: Database }) {
  return {
    /**
     * Adds a company. A name is needed; the person adding it looks after it unless an owner is named (404 when that person does not work for
     * the business). A free-mail domain (gmail.com and the like) is refused (400): it says nothing about a firm. A name a live company already has
     * (capital letters and spaces do not matter) or a domain a live company already has answers 409 naming that company.
     */
    async createCompany(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role' | 'defaultCountry'>,
      request: CreateCompanyRequest,
    ): Promise<Company> {
      if (request.domain !== undefined && isFreeMailDomain(request.domain)) {
        throw new ApiError(
          400,
          'FREE_MAIL_DOMAIN',
          'This is a free email service, not a firm. Leave the domain empty, or enter the firm’s own website domain.',
        );
      }
      let phone: ReturnType<typeof parsePhone> = null;
      if (request.phone !== undefined) {
        phone = parsePhone(request.phone, principal.defaultCountry as CountryCode);
        if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Enter a valid phone number, like +91 98470 12345.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Look first, so the common case answers cleanly; the unique indexes below still guard the race
          const sameName = await companiesRepository.findCompanyIdByNameKey(
            transaction,
            accountId,
            makeCompanyNameKey(request.name),
          );
          if (sameName) throw nameExists(sameName);
          if (request.domain !== undefined) {
            const sameDomain = await companiesRepository.findCompanyIdByDomain(transaction, accountId, request.domain);
            if (sameDomain) throw domainExists(sameDomain);
          }
          const row = await companiesRepository.insertCompany(transaction, {
            id: uuidv7(),
            accountId,
            name: request.name,
            domain: request.domain ?? null,
            phone: phone?.e164 ?? null,
            city: request.city ?? null,
            ownerUserId: request.ownerUserId ?? principal.userId,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'companies.created',
            details: { recordType: 'company', recordId: row.id },
          });
          const [company] = await describeCompanies(transaction, accountId, [row], visibleLeadsOf(principal));
          return company as Company;
        });
      } catch (error) {
        // Two requests at the same moment: the database's unique rules decide, and the loser gets the same 409
        if (error instanceof Error && 'code' in error) {
          if (error.code === UNIQUE_VIOLATION) {
            const indexName = 'constraint' in error ? String(error.constraint) : '';
            throw indexName === DOMAIN_INDEX ? domainExists(undefined) : nameExists(undefined);
          }
          if (error.code === FOREIGN_KEY_VIOLATION) throw notFound('The owner');
        }
        throw error;
      }
    },

    /**
     * One company with its numbers, its people and their leads (newest first). The "own leads only" role sees only the leads it owns, and the
     * numbers add up only those. An unknown company, a deleted one and another business's company answer 404.
     */
    async getCompany(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      companyId: string,
    ): Promise<CompanyDetail> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const row = await companiesRepository.findCompanyById(transaction, principal.accountId, companyId);
        if (!row) throw notFound('That company');
        const [company] = await describeCompanies(transaction, principal.accountId, [row], visibleLeadsOf(principal));
        const contacts = await findContactsOfCompany(transaction, { accountId: principal.accountId, companyId });
        const leads = await findLeadsOfContacts(transaction, {
          accountId: principal.accountId,
          contactIds: contacts.map((contact) => contact.id),
          ...(visibleLeadsOf(principal) ? { visibleToUserId: principal.userId } : {}),
        });
        return {
          ...(company as Company),
          contacts: contacts.map((contact) => ({
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            lifecycleStage: contact.lifecycleStage,
          })),
          leads: leads.map((lead) => ({
            id: lead.id,
            contactId: lead.contactId,
            stageName: lead.stageName,
            stageKind: lead.stageKind,
            interest: lead.interest,
            budgetPaise: lead.budgetPaise,
            createdAt: lead.createdAt.toISOString(),
          })),
        };
      });
    },

    /**
     * Puts a contact in a company, or takes it out of its company with `null`. A contact belongs to at most one company, so this also moves it
     * out of the company it was in. An unknown contact or company, and another business's, answer 404. Writes the activity log and publishes
     * `contact.company_changed` (ids only). Putting a contact in the company it is already in changes nothing.
     */
    async setCompanyOfContact(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      contactId: string,
      companyId: string | null,
    ): Promise<Contact> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (companyId !== null && !(await companiesRepository.findCompanyById(transaction, accountId, companyId))) {
          throw notFound('That company');
        }
        const result = await setContactCompany(transaction, { accountId, contactId, companyId, actor });
        if (!result) throw notFound('That contact');
        if (result.previousCompanyId !== companyId) {
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'contacts.company_changed',
            details: { recordType: 'contact', recordId: contactId, fields: ['companyId'] },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'contact.company_changed',
            payload: {
              contactId,
              fromCompanyId: result.previousCompanyId,
              toCompanyId: companyId,
              by: { kind: actor.kind, id: actor.id },
            },
          });
        }
        return result.contact;
      });
    },

    /** One page of the business's companies, newest change first, narrowed by a search and/or an exact domain, with the numbers about their people. */
    async listCompanies(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      query: ListCompaniesQuery,
    ): Promise<CompaniesListResponse> {
      const { items, total } = await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const found = await companiesRepository.listCompanies(transaction, principal.accountId, {
          searchPattern: makeSearchPattern(query.q),
          domain: query.domain,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
        });
        return {
          items: await describeCompanies(transaction, principal.accountId, found.items, visibleLeadsOf(principal)),
          total: found.total,
        };
      });
      return { items, total, page: query.page, limit: query.limit };
    },
  };
}

export type CompaniesService = ReturnType<typeof createCompaniesService>;
