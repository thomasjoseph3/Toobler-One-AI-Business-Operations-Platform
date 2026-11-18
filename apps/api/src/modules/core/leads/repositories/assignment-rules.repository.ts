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

/** The rule as it is stored. */
export interface AssignmentRuleRow {
  mode: 'one_person' | 'round_robin' | 'by_offering';
  userId: string | null;
  lastAssignedUserId: string | null;
}

/** How the business shares out new leads, or undefined if it has no rule. */
export async function findAssignmentRule(db: Db, accountId: string): Promise<AssignmentRuleRow | undefined> {
  const row = await db
    .selectFrom('assignment_rules')
    .select(['mode', 'user_id', 'last_assigned_user_id'])
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row ? { mode: row.mode, userId: row.user_id, lastAssignedUserId: row.last_assigned_user_id } : undefined;
}

/**
 * Like findAssignmentRule, but locks the rule until the transaction ends, so two new leads (or a new lead and a rule change)
 * at the same moment take turns instead of both seeing the same "last person".
 */
export async function lockAssignmentRule(db: Db, accountId: string): Promise<AssignmentRuleRow | undefined> {
  const row = await db
    .selectFrom('assignment_rules')
    .select(['mode', 'user_id', 'last_assigned_user_id'])
    .where('account_id', '=', accountId)
    .forUpdate()
    .executeTakeFirst();
  return row ? { mode: row.mode, userId: row.user_id, lastAssignedUserId: row.last_assigned_user_id } : undefined;
}

/** The people who take turns, in turn order. */
export async function listRoundRobinUserIds(db: Db, accountId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('assignment_rule_people')
    .select('user_id')
    .where('account_id', '=', accountId)
    .orderBy('sort')
    .execute();
  return rows.map((row) => row.user_id);
}

/** Replaces the list of people who take turns with these, in this order. */
export async function replaceRoundRobinUserIds(
  db: Db,
  options: { accountId: string; userIds: string[]; actor: Actor },
): Promise<void> {
  await db.deleteFrom('assignment_rule_people').where('account_id', '=', options.accountId).execute();
  for (const [position, userId] of options.userIds.entries()) {
    await db
      .insertInto('assignment_rule_people')
      .values({
        account_id: options.accountId,
        user_id: userId,
        sort: position,
        created_by: { kind: options.actor.kind, id: options.actor.id },
      })
      .execute();
  }
}

/** Saves how new leads are shared out. */
export async function updateAssignmentRule(
  db: Db,
  options: {
    accountId: string;
    mode: 'one_person' | 'round_robin' | 'by_offering';
    userId: string | null;
    lastAssignedUserId: string | null;
    actor: Actor;
  },
): Promise<void> {
  await db
    .updateTable('assignment_rules')
    .set({
      mode: options.mode,
      user_id: options.userId,
      last_assigned_user_id: options.lastAssignedUserId,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .execute();
}

/** Remembers who got the latest lead, so the next one goes to the person after them. */
export async function setLastAssignedUser(
  db: Db,
  options: { accountId: string; userId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('assignment_rules')
    .set({
      last_assigned_user_id: options.userId,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .execute();
}

/**
 * A person has left the business: if the rule gives new leads to them (the one person, or the fallback for sharing out by offering) it now gives
 * them to `toUserId`, and they drop out of the round-robin turns. Returns true when anything changed. Run it inside the business's fence.
 */
export async function replacePersonInAssignmentRule(
  db: Db,
  options: { accountId: string; fromUserId: string; toUserId: string; actor: Actor },
): Promise<boolean> {
  const changedRule = await db
    .updateTable('assignment_rules')
    .set({ user_id: options.toUserId, updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('user_id', '=', options.fromUserId)
    .returning('account_id')
    .execute();
  const droppedTurns = await db
    .deleteFrom('assignment_rule_people')
    .where('account_id', '=', options.accountId)
    .where('user_id', '=', options.fromUserId)
    .returning('user_id')
    .execute();
  // If the person was the last to be given a lead, the next turn simply starts again from the first person
  await db
    .updateTable('assignment_rules')
    .set({ last_assigned_user_id: null })
    .where('account_id', '=', options.accountId)
    .where('last_assigned_user_id', '=', options.fromUserId)
    .execute();
  return changedRule.length > 0 || droppedTurns.length > 0;
}
