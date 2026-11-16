import type { ConversationAlert, ConversationOutcome, ConversationPlaybook } from '@toobler-one/shared';
import type { Selectable } from 'kysely';
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
