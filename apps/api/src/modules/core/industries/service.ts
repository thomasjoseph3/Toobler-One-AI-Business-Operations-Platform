import type { CreateIndustryRequest, Industry, IndustriesResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../kernel/activity-log';
import type { Database } from '../../../kernel/database';
import { conflict } from '../../../kernel/errors';
import type { Principal } from '../../../kernel/http/guard';
import * as repository from './repository';

// Where a new industry goes in the list when the platform admin does not say: after the seeded ones (10 to 70) and before
// "Something else" (999).
const DEFAULT_SORT_ORDER = 100;

/** The industries a person can pick, in display order. Only industries that are switched on. */
export async function listIndustries(database: Database): Promise<IndustriesResponse> {
  return { items: await repository.findActiveIndustries(database.system) };
}

/** Whether an industry id is on the list. Other modules (sign-up) use this through this module's index.ts. */
export function isActiveIndustry(database: Database, industryId: string): Promise<boolean> {
  return repository.isActiveIndustryId(database.system, industryId);
}

/**
 * Adds an industry to the list. Only a platform admin may do this (the route's `platform` access checks it). It runs on
 * the owner connection, because the normal app role can read the table but not change it. The addition is written to the
 * activity log under the admin's own business.
 */
export async function addIndustry(
  database: Database,
  admin: Principal,
  request: CreateIndustryRequest,
): Promise<Industry> {
  try {
    await database.runInSystemTransaction(async (transaction) => {
      await repository.insertIndustry(transaction, {
        id: request.id,
        label: request.label,
        sortOrder: request.sortOrder ?? DEFAULT_SORT_ORDER,
      });
      await writeActivityLog(transaction, {
        accountId: admin.accountId,
        actor: { kind: 'user', id: admin.userId },
        kind: 'industries.added',
        details: { recordType: 'industry', fields: ['id', 'label'] },
      });
    });
  } catch (error) {
    // The database's primary key decides when two requests add the same id
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      throw conflict('INDUSTRY_EXISTS', `An industry with the id "${request.id}" already exists.`);
    }
    throw error;
  }
  return { id: request.id, label: request.label };
}
