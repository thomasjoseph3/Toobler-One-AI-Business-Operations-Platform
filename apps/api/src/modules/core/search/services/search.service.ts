import { GLOBAL_SEARCH_RESULTS_PER_KIND, type GlobalSearchResponse } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import type { Principal } from '../../../../kernel/http/guard';
import { findCompaniesMatchingText } from '../../companies';
import { findContactsMatchingText } from '../../contacts';
import { findLeadsOfContacts } from '../../leads';

/** How many matching people are looked at to find their leads (more than are shown, because some people have no lead). */
const PEOPLE_LOOKED_AT_FOR_LEADS = 25;

/**
 * The search box at the top of every page (F11). It finds people by name, email or phone (any way the number is typed), companies by name, website or
 * city, and leads through the person they are about. At most 5 of each. The "own leads only" role finds only its own leads; people and companies are open
 * to every role, as they are on their own pages. This module owns no table: it asks the contacts, companies and leads modules.
 */
export function createSearchService({ database }: { database: Database }) {
  return {
    /** Searches for `text` in the signed-in person's business. Blank or one-letter text finds nothing. */
    async search(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      text: string,
    ): Promise<GlobalSearchResponse> {
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const people = await findContactsMatchingText(transaction, {
          accountId,
          text,
          limit: PEOPLE_LOOKED_AT_FOR_LEADS,
        });
        const companies = await findCompaniesMatchingText(transaction, {
          accountId,
          text,
          limit: GLOBAL_SEARCH_RESULTS_PER_KIND,
        });
        const leads =
          people.length === 0
            ? []
            : await findLeadsOfContacts(transaction, {
                accountId,
                contactIds: people.map((person) => person.id),
                ...(principal.role === 'staff_own' ? { visibleToUserId: principal.userId } : {}),
              });
        const personById = new Map(people.map((person) => [person.id, person]));
        return {
          contacts: people.slice(0, GLOBAL_SEARCH_RESULTS_PER_KIND),
          companies,
          leads: leads.slice(0, GLOBAL_SEARCH_RESULTS_PER_KIND).map((lead) => ({
            id: lead.id,
            contactId: lead.contactId,
            contactName: personById.get(lead.contactId)?.name ?? null,
            contactPhone: personById.get(lead.contactId)?.phone ?? null,
            stageName: lead.stageName,
            interest: lead.interest,
          })),
        };
      });
    },
  };
}
