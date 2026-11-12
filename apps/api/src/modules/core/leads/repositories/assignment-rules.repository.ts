import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `assignment_rules` table (how new leads are shared out). More functions arrive with their routes.

/** Adds the business's rule "every new lead goes to this one person". */
export async function insertOnePersonRule(
  db: Db,
  rule: { accountId: string; userId: string; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: rule.actor.kind, id: rule.actor.id };
  await db
    .insertInto('assignment_rules')
    .values({
      account_id: rule.accountId,
      mode: 'one_person',
      user_id: rule.userId,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** How the business shares out new leads, or undefined if it has no rule. */
export async function findAssignmentRule(
  db: Db,
  accountId: string,
): Promise<{ mode: 'one_person' | 'round_robin'; userId: string | null } | undefined> {
  const row = await db
    .selectFrom('assignment_rules')
    .select(['mode', 'user_id'])
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row ? { mode: row.mode, userId: row.user_id } : undefined;
}
