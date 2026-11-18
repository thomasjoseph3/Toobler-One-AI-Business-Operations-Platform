import { customFieldsToFilterable, type ListContactsQuery } from '@toobler-one/shared';
import { customAnswerToCell, momentToDateCell } from '../../../../kernel/csv/cells';
import type { CsvTable } from '../../../../kernel/csv/write-csv';
import type { Db } from '../../../../kernel/database';
import { readFilterRequest } from '../../../../kernel/filters/read-filter-request';
import { findFieldDefinitions } from '../../fields';
import { readSearchText } from '../helpers/contact-search';
import * as contactsRepository from '../repositories/contacts.repository';
import { hideRemovedContactAnswers } from './contact-custom-values.service';

// Exporting the contacts a list shows (F12): the same search, stage and filters as the list, every page of it, as a table the exports module writes as CSV.

/** How many contacts are read from the database at a time. */
const EXPORT_PAGE_ROWS = 500;

/** The words for each lifecycle stage in a file (the screen's own words). */
const STAGE_WORDS: Record<string, string> = {
  new: 'New',
  lead: 'Lead',
  customer: 'Customer',
  repeat_customer: 'Repeat customer',
  not_a_fit: 'Not a fit',
};

/**
 * The contacts that match a contacts list's own query (`q`, `lifecycleStage`, `filters`) as a table: name, phone, email, language, stage, company, whether an import made them, the
 * date they were added, and one column for each of the business's live contact fields. Exactly what the list shows, all pages, up to `maxRows`. The company's name is
 * looked up by the caller (this module does not know companies). A bad `filters` is 400 INVALID_FILTERS, as on the list. Run it inside the business's own transaction.
 */
export async function findContactsForExport(
  transaction: Db,
  options: {
    accountId: string;
    query: ListContactsQuery;
    maxRows: number;
    resolveCompanyNames: (companyIds: string[]) => Promise<Map<string, string>>;
  },
): Promise<CsvTable> {
  const { accountId, query } = options;
  const definitions = await findFieldDefinitions(transaction, accountId, 'contact');
  const conditions = readFilterRequest(query.filters, customFieldsToFilterable(definitions));
  const search = readSearchText(query.q);

  const rows: string[][] = [];
  for (let offset = 0; rows.length < options.maxRows; offset += EXPORT_PAGE_ROWS) {
    const page = await contactsRepository.listContacts(transaction, accountId, {
      search,
      lifecycleStage: query.lifecycleStage,
      conditions,
      limit: Math.min(EXPORT_PAGE_ROWS, options.maxRows - rows.length),
      offset,
    });
    if (page.items.length === 0) break;
    const contacts = await hideRemovedContactAnswers(transaction, accountId, page.items);
    const companyIds = [...new Set(contacts.flatMap((contact) => (contact.companyId ? [contact.companyId] : [])))];
    const companyNames = await options.resolveCompanyNames(companyIds);
    for (const contact of contacts) {
      rows.push([
        contact.name ?? '',
        contact.phone ?? '',
        contact.email ?? '',
        contact.language ?? '',
        STAGE_WORDS[contact.lifecycleStage] ?? contact.lifecycleStage,
        contact.companyId ? (companyNames.get(contact.companyId) ?? '') : '',
        contact.importedAt === null ? '' : 'Imported',
        momentToDateCell(contact.createdAt),
        ...definitions.map((definition) => customAnswerToCell(contact.custom[definition.key])),
      ]);
    }
    if (page.items.length < EXPORT_PAGE_ROWS) break;
  }
  return {
    headers: [
      'Name',
      'Phone',
      'Email',
      'Language',
      'Stage',
      'Company',
      'Source',
      'Added',
      ...definitions.map((definition) => definition.label),
    ],
    rows,
  };
}
