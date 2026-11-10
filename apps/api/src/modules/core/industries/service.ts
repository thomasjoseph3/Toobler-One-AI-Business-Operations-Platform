import type { IndustriesResponse } from '@toobler-one/shared';
import type { Database } from '../../../kernel/database';
import * as repository from './repository';

/** The industries a person can pick, in display order. Only industries that are switched on. */
export async function listIndustries(database: Database): Promise<IndustriesResponse> {
  return { items: await repository.findActiveIndustries(database.system) };
}

/** Whether an industry id is on the list. Other modules (sign-up) use this through this module's index.ts. */
export function isActiveIndustry(database: Database, industryId: string): Promise<boolean> {
  return repository.isActiveIndustryId(database.system, industryId);
}
