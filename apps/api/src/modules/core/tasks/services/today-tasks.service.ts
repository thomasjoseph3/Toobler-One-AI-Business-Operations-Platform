import type { Db } from '../../../../kernel/database';
import * as tasksRepository from '../repositories/tasks.repository';

/** An open task as the Today module reads it (F22): the same shape the tasks repository returns. */
export type OpenTaskRow = tasksRepository.TaskRow;

/**
 * The business's open tasks for the Today page (F22), narrowed to one owner for the "me" scope (and the own-leads-only
 * role). Used by the Today module through this module's index.ts; run it inside the business's own transaction.
 */
export async function findOpenTasksForToday(
  transaction: Db,
  options: { accountId: string; ownerUserId?: string | undefined },
): Promise<OpenTaskRow[]> {
  return tasksRepository.listOpenTasksForToday(transaction, options);
}
