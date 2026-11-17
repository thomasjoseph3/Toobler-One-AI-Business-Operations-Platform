import type { Db } from '../../../../kernel/database';
import * as tasksRepository from '../repositories/tasks.repository';

/** The few facts about a task that another module shows next to its own records. */
export interface TaskSummary {
  id: string;
  title: string;
  kind: 'call' | 'whatsapp' | 'email' | 'todo';
}

/**
 * The words and kind of one task of the business, or undefined: an unknown id and another business's task look the same. A task deleted
 * since is still found (a timeline line about it was true when it was written). Used by the activities module (through this module's
 * index.ts) to write "added the task ..." on a timeline, because events carry ids only and never the business's words. Run it inside the
 * business's own transaction.
 */
export async function findTaskSummary(
  transaction: Db,
  options: { accountId: string; taskId: string },
): Promise<TaskSummary | undefined> {
  return tasksRepository.findTaskWords(transaction, options.accountId, options.taskId);
}
