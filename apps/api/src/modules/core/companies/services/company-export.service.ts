import { customFieldsToFilterable, type CustomValue, type ListCompaniesQuery } from '@toobler-one/shared';
import { customAnswerToCell, momentToDateCell } from '../../../../kernel/csv/cells';
import type { CsvTable } from '../../../../kernel/csv/write-csv';
import type { Db } from '../../../../kernel/database';
import { readFilterRequest } from '../../../../kernel/filters/read-filter-request';
import { findFieldDefinitions } from '../../fields';
import * as companiesRepository from '../repositories/companies.repository';

// Exporting the companies a list shows (F12): the same search and filters as the list, every page of it, as a table the exports module writes as CSV.

/** How many companies are read from the database at a time. */
const EXPORT_PAGE_ROWS = 500;

/** Escapes the characters that mean something to the database's LIKE, so the search text is looked for as plain text. */
function makeSearchPattern(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return `%${text.replace(/[\\%_]/gu, (character) => `\\${character}`)}%`;
}

/**
 * The companies that match a companies list's own query (`q`, `domain`, `filters`) as a table: name, website, phone, city, the date added, and one column for each of
 * the business's live company fields. Exactly what the list shows, all pages, up to `maxRows`. Run it inside the business's own transaction.
 */
export async function findCompaniesForExport(
  transaction: Db,
  options: { accountId: string; query: ListCompaniesQuery; maxRows: number },
): Promise<CsvTable> {
  const { accountId, query } = options;
  const definitions = await findFieldDefinitions(transaction, accountId, 'company');
  const conditions = readFilterRequest(query.filters, customFieldsToFilterable(definitions));
  const liveKeys = new Set(definitions.map((definition) => definition.key));

  const rows: string[][] = [];
  for (let offset = 0; rows.length < options.maxRows; offset += EXPORT_PAGE_ROWS) {
    const page = await companiesRepository.listCompanies(transaction, accountId, {
      searchPattern: makeSearchPattern(query.q),
      domain: query.domain,
      conditions,
      limit: Math.min(EXPORT_PAGE_ROWS, options.maxRows - rows.length),
      offset,
    });
    if (page.items.length === 0) break;
    for (const company of page.items) {
      const answers = company.custom as Record<string, CustomValue>;
      rows.push([
        company.name,
        company.domain ?? '',
        company.phone ?? '',
        company.city ?? '',
        momentToDateCell(company.createdAt),
        // Only the answers of live fields: a removed field's answers stay hidden
        ...definitions.map((definition) =>
          liveKeys.has(definition.key) ? customAnswerToCell(answers[definition.key]) : '',
        ),
      ]);
    }
    if (page.items.length < EXPORT_PAGE_ROWS) break;
  }
  return {
    headers: ['Name', 'Website', 'Phone', 'City', 'Added', ...definitions.map((definition) => definition.label)],
    rows,
  };
}
