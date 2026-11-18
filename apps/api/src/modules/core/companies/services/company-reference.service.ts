import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { uuidv7 } from '../../../../kernel/ids';
import { makeCompanyNameKey } from '../helpers/company-name';
import * as companiesRepository from '../repositories/companies.repository';

/** The little another module needs to show something about a company: which company, and its name. */
export interface CompanyReference {
  id: string;
  name: string;
}

/**
 * One live company of the business as a short reference, or undefined: a deleted company, an unknown id and another business's company all look the
 * same. Used by the activities module (through this module's index.ts) before it shows a company's timeline. Run it inside the business's own transaction.
 */
export async function findCompanyReference(
  transaction: Db,
  options: { accountId: string; companyId: string },
): Promise<CompanyReference | undefined> {
  const company = await companiesRepository.findCompanyById(transaction, options.accountId, options.companyId);
  return company ? { id: company.id, name: company.name } : undefined;
}

/**
 * The live company with this name (capitals and spaces do not matter), made on the spot when there is none. For a name that was heard rather than
 * typed (the AI heard "Infosys HR"): it is never an error. An empty name, or one longer than a company name can be, gives nothing. Used by the agents
 * module (through this module's index.ts). Run it inside the business's own transaction.
 */
export async function findOrCreateCompanyByName(
  transaction: Db,
  options: { accountId: string; name: string; actor: Actor },
): Promise<{ companyId: string; created: boolean } | undefined> {
  const name = options.name.trim().replace(/\s+/gu, ' ');
  if (name === '' || name.length > 120) return undefined;
  const { accountId, actor } = options;
  const existingId = await companiesRepository.findCompanyIdByNameKey(transaction, accountId, makeCompanyNameKey(name));
  if (existingId) return { companyId: existingId, created: false };
  const newId = uuidv7();
  const insertedId = await companiesRepository.insertCompanyIfFree(transaction, { id: newId, accountId, name, actor });
  if (!insertedId) {
    // Another request made it at the same moment: use that one
    const racedId = await companiesRepository.findCompanyIdByNameKey(transaction, accountId, makeCompanyNameKey(name));
    return racedId ? { companyId: racedId, created: false } : undefined;
  }
  await writeActivityLog(transaction, {
    accountId,
    actor,
    kind: 'companies.created',
    details: { recordType: 'company', recordId: insertedId },
  });
  return { companyId: insertedId, created: true };
}
