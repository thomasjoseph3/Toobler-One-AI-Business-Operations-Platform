import type { Db } from '../../../../kernel/database';
import * as companiesRepository from '../repositories/companies.repository';

/** A company as the search box shows it. */
export interface CompanyFound {
  id: string;
  name: string;
  domain: string | null;
  city: string | null;
}

/**
 * The companies whose name, website or city contains what was typed (capitals do not matter, and the characters that mean something to the database are
 * searched for as plain text), most recently changed first, at most `limit`. Used by the search module (through this module's index.ts). Run it inside the
 * business's own transaction.
 */
export async function findCompaniesMatchingText(
  transaction: Db,
  options: { accountId: string; text: string; limit: number },
): Promise<CompanyFound[]> {
  const text = options.text.trim();
  if (text === '') return [];
  const searchPattern = `%${text.replace(/[\\%_]/gu, (character) => `\\${character}`)}%`;
  const { items } = await companiesRepository.listCompanies(transaction, options.accountId, {
    searchPattern,
    domain: undefined,
    limit: options.limit,
    offset: 0,
  });
  return items.map((company) => ({ id: company.id, name: company.name, domain: company.domain, city: company.city }));
}
