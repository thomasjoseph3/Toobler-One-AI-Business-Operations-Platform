import type { Db } from '../../../../kernel/database';
import * as leadsRepository from '../repositories/leads.repository';

export type { LeadForTodayRow } from '../repositories/leads.repository';

/**
 * The leads the Today page (F22) needs: every live lead that is still open, or came in this week, or was closed this
 * week, narrowed to one owner for the "me" scope (and the own-leads-only role). Used by the Today module through this
 * module's index.ts; run it inside the business's own transaction.
 */
export async function findLeadsForToday(
  transaction: Db,
  options: { accountId: string; ownerUserId?: string | undefined; sinceWeekStart: Date },
): Promise<leadsRepository.LeadForTodayRow[]> {
  return leadsRepository.listLeadsForToday(transaction, options);
}
