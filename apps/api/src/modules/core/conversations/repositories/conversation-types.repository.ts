import type { ConversationAlert, ConversationOutcome, ConversationPlaybook } from '@toobler-one/shared';
import { sql, type Selectable } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { ConversationTypesTable } from '../../../../kernel/database/types';

// The SQL for the `conversation_types` table. Every query names the business as well as the id (defence in depth: the
// database also fences every query by business).

type TicketTypeWord = 'callback' | 'question' | 'complaint' | 'existing_customer' | 'other';
type TicketPriorityWord = 'low' | 'normal' | 'high' | 'urgent';

/** A conversation type as the database holds it. The service turns it into the API's ConversationType. */
export interface ConversationTypeRow {
  id: string;
  key: string;
  label: string;
  description: string;
  examples: string[];
  isSystem: boolean;
  outcome: ConversationOutcome;
  ticketType: TicketTypeWord | null;
  priority: TicketPriorityWord | null;
  needsPerson: boolean;
  alert: ConversationAlert | null;
  playbook: ConversationPlaybook;
  isActive: boolean;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Turns a database row of `conversation_types` into a ConversationTypeRow. */
function toConversationTypeRow(row: Selectable<ConversationTypesTable>): ConversationTypeRow {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    // Stored as JSON; only this module writes it
    examples: row.examples as string[], // the database check guarantees a list of texts
    isSystem: row.is_system,
    outcome: row.outcome,
    ticketType: row.ticket_type,
    priority: row.priority,
    needsPerson: row.needs_person,
    alert: row.alert as ConversationAlert | null,
    playbook: row.playbook,
    isActive: row.is_active,
    sort: row.sort,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All the business's types in the order they are shown (sort, then id so the order never wobbles). */
export async function listConversationTypes(db: Db, accountId: string): Promise<ConversationTypeRow[]> {
  const rows = await db
    .selectFrom('conversation_types')
    .selectAll()
    .where('account_id', '=', accountId)
    .orderBy('sort')
    .orderBy('id')
    .execute();
  return rows.map(toConversationTypeRow);
}

/** One type of the business by its id, or undefined when the id is unknown or belongs to another business. */
export async function findConversationTypeById(
  db: Db,
  accountId: string,
  typeId: string,
): Promise<ConversationTypeRow | undefined> {
  const row = await db
    .selectFrom('conversation_types')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', typeId)
    .executeTakeFirst();
  return row ? toConversationTypeRow(row) : undefined;
}

/** How many types the business has in all (zero means it has not been given its starting types yet). */
export async function countConversationTypes(db: Db, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('conversation_types')
    .select((expressionBuilder) => expressionBuilder.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** How many of the business's types are switched on. */
export async function countActiveConversationTypes(db: Db, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('conversation_types')
    .select((expressionBuilder) => expressionBuilder.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('is_active', '=', true)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** The highest `sort` number the business uses, or -1 when it has no types (so the next one gets 0). */
export async function findHighestSort(db: Db, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('conversation_types')
    .select((expressionBuilder) => expressionBuilder.fn.max('sort').as('highest'))
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row?.highest ?? -1;
}

/** What is needed to add one type. */
export interface NewConversationType {
  id: string;
  accountId: string;
  key: string;
  label: string;
  description: string;
  examples: string[];
  isSystem: boolean;
  outcome: ConversationOutcome;
  ticketType: TicketTypeWord | null;
  priority: TicketPriorityWord | null;
  needsPerson: boolean;
  alert: ConversationAlert | null;
  playbook: ConversationPlaybook;
  sort: number;
  actor: Actor;
}

/**
 * Adds a type. When the business already has one with this key, nothing is added and false comes back (the database's
 * unique key decides, so two requests at the same moment cannot both win). Returns true when the type was added.
 */
export async function insertConversationTypeIfKeyIsFree(db: Db, type: NewConversationType): Promise<boolean> {
  const actorStamp = { kind: type.actor.kind, id: type.actor.id };
  const result = await db
    .insertInto('conversation_types')
    .values({
      id: type.id,
      account_id: type.accountId,
      key: type.key,
      label: type.label,
      description: type.description,
      examples: JSON.stringify(type.examples),
      is_system: type.isSystem,
      outcome: type.outcome,
      ticket_type: type.ticketType,
      priority: type.priority,
      needs_person: type.needsPerson,
      alert: type.alert === null ? null : JSON.stringify(type.alert),
      playbook: type.playbook,
      sort: type.sort,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .onConflict((conflict) => conflict.columns(['account_id', 'key']).doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** The columns a manager can change. A field that is left out stays as it is; `null` clears a field that can be empty. */
export interface ConversationTypeChanges {
  label?: string;
  description?: string;
  examples?: string[];
  outcome?: ConversationOutcome;
  ticketType?: TicketTypeWord | null;
  priority?: TicketPriorityWord | null;
  needsPerson?: boolean;
  alert?: ConversationAlert | null;
  playbook?: ConversationPlaybook;
  isActive?: boolean;
  actor: Actor;
}

/**
 * Changes the fields that were sent on one type of the business. Returns false when no such type exists (unknown id, or
 * another business's). Fails with a "check" error when switching the type on would pass the limit of active types.
 */
export async function updateConversationType(
  db: Db,
  accountId: string,
  typeId: string,
  changes: ConversationTypeChanges,
): Promise<boolean> {
  const result = await db
    .updateTable('conversation_types')
    .set({
      ...(changes.label !== undefined ? { label: changes.label } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
      ...(changes.examples !== undefined ? { examples: JSON.stringify(changes.examples) } : {}),
      ...(changes.outcome !== undefined ? { outcome: changes.outcome } : {}),
      ...(changes.ticketType !== undefined ? { ticket_type: changes.ticketType } : {}),
      ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
      ...(changes.needsPerson !== undefined ? { needs_person: changes.needsPerson } : {}),
      ...(changes.alert !== undefined ? { alert: changes.alert === null ? null : JSON.stringify(changes.alert) } : {}),
      ...(changes.playbook !== undefined ? { playbook: changes.playbook } : {}),
      ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
      updated_by: { kind: changes.actor.kind, id: changes.actor.id },
    })
    .where('account_id', '=', accountId)
    .where('id', '=', typeId)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Removes one type of the business. Returns false when no such type exists. Fails with a "check" error for a system type. */
export async function deleteConversationType(db: Db, accountId: string, typeId: string): Promise<boolean> {
  const result = await db
    .deleteFrom('conversation_types')
    .where('account_id', '=', accountId)
    .where('id', '=', typeId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

/**
 * Makes the business's other changes to the order of its types wait their turn until the end of this transaction. Adding and
 * reordering work out positions from what is there, so two at the same moment must not both read the same list.
 */
export async function lockConversationTypesOfBusiness(db: Db, accountId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`conversation_types_order:${accountId}`}))`.execute(db);
}

/** The ids of all the business's types in the order they are shown. */
export async function listConversationTypeIdsInOrder(db: Db, accountId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('conversation_types')
    .select('id')
    .where('account_id', '=', accountId)
    .orderBy('sort')
    .orderBy('id')
    .execute();
  return rows.map((row) => row.id);
}

/** Gives each listed type its position (0, 1, 2, ...) and records who did it. */
export async function setConversationTypePositions(
  db: Db,
  options: { accountId: string; typeIdsInOrder: readonly string[]; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  for (const [position, typeId] of options.typeIdsInOrder.entries()) {
    await db
      .updateTable('conversation_types')
      .set({ sort: position, updated_by: actorStamp })
      .where('account_id', '=', options.accountId)
      .where('id', '=', typeId)
      .execute();
  }
}

/** The positions the business's types have now, in the order shown (to see whether they already run 0, 1, 2, ...). */
export async function listConversationTypePositions(db: Db, accountId: string): Promise<number[]> {
  const rows = await db
    .selectFrom('conversation_types')
    .select('sort')
    .where('account_id', '=', accountId)
    .orderBy('sort')
    .orderBy('id')
    .execute();
  return rows.map((row) => row.sort);
}
