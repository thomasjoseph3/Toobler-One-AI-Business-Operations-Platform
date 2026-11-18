import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import * as companiesRepository from '../repositories/companies.repository';
import type { CompanyRow, MergedCompanyValues } from '../repositories/companies.repository';

// What the duplicates module (F13) needs from companies. Every function takes the caller's transaction, so it saves or rolls back with the merge.

export type { CompanyRow, MergedCompanyValues };

/** Every live company's id, name and phone, for finding companies that look like one firm. */
export async function findCompaniesForDuplicateCheck(
  transaction: Db,
  accountId: string,
): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  return companiesRepository.listCompaniesForMatching(transaction, accountId);
}

/** The live companies among these ids, in full. A deleted or merged-away company and another business's company are simply missing. */
export async function findCompaniesByIds(
  transaction: Db,
  options: { accountId: string; companyIds: string[] },
): Promise<CompanyRow[]> {
  return companiesRepository.findCompaniesByIds(transaction, options.accountId, options.companyIds);
}

/** Merges one live company into another (see the repository). Returns false when either company is gone. */
export async function mergeCompanyInto(
  transaction: Db,
  options: { accountId: string; keptId: string; mergedAwayId: string; values: MergedCompanyValues; actor: Actor },
): Promise<boolean> {
  return companiesRepository.mergeCompanyInto(transaction, options);
}
