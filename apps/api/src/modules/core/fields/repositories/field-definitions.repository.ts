import type { FieldDefinition, FieldObject } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `field_definitions` table (the custom fields of a business). Every function names the business it works for. Run each inside the
// business's fence. Archived fields are left out of every read except `keyIsTaken`.

/** The columns every read returns. */
const FIELD_COLUMNS = ['id', 'object', 'key', 'label', 'type', 'options', 'ai_asks', 'required_for_won'] as const;

/** Turns a stored list back into a list of texts, ignoring anything that is not text (a damaged row never breaks a screen). */
function toOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Turns a database row into the FieldDefinition the API answers with. */
function toFieldDefinition(row: {
  id: string;
  object: FieldObject;
  key: string;
  label: string;
  type: FieldDefinition['type'];
  options: unknown;
  ai_asks: boolean;
  required_for_won: boolean;
}): FieldDefinition {
  return {
    id: row.id,
    object: row.object,
    key: row.key,
    label: row.label,
    type: row.type,
    options: toOptions(row.options),
    aiAsks: row.ai_asks,
    requiredForWon: row.required_for_won,
  };
}

/** The live (not removed) fields of the business, in the order to show them: one object's, or all three objects' when `object` is left out. */
export async function listFieldDefinitions(
  db: Db,
  accountId: string,
  object: FieldObject | undefined,
): Promise<FieldDefinition[]> {
  let query = db
    .selectFrom('field_definitions')
    .select(FIELD_COLUMNS)
    .where('account_id', '=', accountId)
    .where('archived_at', 'is', null);
  if (object !== undefined) query = query.where('object', '=', object);
  const rows = await query.orderBy('object').orderBy('sort').orderBy('id').execute();
  return rows.map(toFieldDefinition);
}

/** How many live fields the object has, and the highest `sort` among them (so a new field can go last). */
export async function describeObjectFields(
  db: Db,
  accountId: string,
  object: FieldObject,
): Promise<{ liveCount: number; highestSort: number }> {
  const row = await db
    .selectFrom('field_definitions')
    .select((expression) => [
      expression.fn.countAll<string>().as('live_count'),
      expression.fn.max('sort').as('highest_sort'),
    ])
    .where('account_id', '=', accountId)
    .where('object', '=', object)
    .where('archived_at', 'is', null)
    .executeTakeFirstOrThrow();
  return { liveCount: Number(row.live_count), highestSort: row.highest_sort === null ? -1 : Number(row.highest_sort) };
}

/** Whether the object already has a field with this key, removed ones included (a key is never reused). */
export async function keyIsTaken(db: Db, accountId: string, object: FieldObject, key: string): Promise<boolean> {
  const row = await db
    .selectFrom('field_definitions')
    .select('id')
    .where('account_id', '=', accountId)
    .where('object', '=', object)
    .where('key', '=', key)
    .executeTakeFirst();
  return row !== undefined;
}

/** Adds a field and returns it. Throws a unique-violation (23505) when two fields would share a key (two requests at the same moment). */
export async function insertFieldDefinition(
  db: Db,
  field: {
    id: string;
    accountId: string;
    object: FieldObject;
    key: string;
    label: string;
    type: FieldDefinition['type'];
    options: string[];
    aiAsks: boolean;
    requiredForWon: boolean;
    sort: number;
    actor: Actor;
  },
): Promise<FieldDefinition> {
  const actorStamp = { kind: field.actor.kind, id: field.actor.id };
  const row = await db
    .insertInto('field_definitions')
    .values({
      id: field.id,
      account_id: field.accountId,
      object: field.object,
      key: field.key,
      label: field.label,
      type: field.type,
      options: JSON.stringify(field.options),
      ai_asks: field.aiAsks,
      required_for_won: field.requiredForWon,
      sort: field.sort,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .returning(FIELD_COLUMNS)
    .executeTakeFirstOrThrow();
  return toFieldDefinition(row);
}

/** One live (not removed) field of the business with its object's rules, or undefined when there is none (or it belongs to another business). */
export async function findFieldDefinition(
  db: Db,
  accountId: string,
  fieldId: string,
): Promise<FieldDefinition | undefined> {
  const row = await db
    .selectFrom('field_definitions')
    .select(FIELD_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', fieldId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  return row === undefined ? undefined : toFieldDefinition(row);
}

/** Changes the editable parts of a live field (only what is given) and returns it, or undefined when there is no such live field. */
export async function updateFieldDefinition(
  db: Db,
  accountId: string,
  fieldId: string,
  changes: { label?: string; options?: string[]; aiAsks?: boolean; requiredForWon?: boolean },
  actor: Actor,
): Promise<FieldDefinition | undefined> {
  const row = await db
    .updateTable('field_definitions')
    .set({
      ...(changes.label !== undefined ? { label: changes.label } : {}),
      ...(changes.options !== undefined ? { options: JSON.stringify(changes.options) } : {}),
      ...(changes.aiAsks !== undefined ? { ai_asks: changes.aiAsks } : {}),
      ...(changes.requiredForWon !== undefined ? { required_for_won: changes.requiredForWon } : {}),
      updated_by: { kind: actor.kind, id: actor.id },
      updated_at: new Date(),
    })
    .where('account_id', '=', accountId)
    .where('id', '=', fieldId)
    .where('archived_at', 'is', null)
    .returning(FIELD_COLUMNS)
    .executeTakeFirst();
  return row === undefined ? undefined : toFieldDefinition(row);
}

/** Removes a field by archiving it (its values are kept, hidden, and the key stays taken). Returns false when there is no such live field. */
export async function archiveFieldDefinition(
  db: Db,
  accountId: string,
  fieldId: string,
  actor: Actor,
): Promise<boolean> {
  const row = await db
    .updateTable('field_definitions')
    .set({ archived_at: new Date(), updated_by: { kind: actor.kind, id: actor.id }, updated_at: new Date() })
    .where('account_id', '=', accountId)
    .where('id', '=', fieldId)
    .where('archived_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** Gives the object's live fields the places 0, 1, 2 ... in the order of these ids. The caller has already checked the ids are exactly the live fields. */
export async function setFieldSortOrder(
  db: Db,
  accountId: string,
  object: FieldObject,
  orderedFieldIds: string[],
  actor: Actor,
): Promise<void> {
  for (const [place, fieldId] of orderedFieldIds.entries()) {
    await db
      .updateTable('field_definitions')
      .set({ sort: place, updated_by: { kind: actor.kind, id: actor.id }, updated_at: new Date() })
      .where('account_id', '=', accountId)
      .where('object', '=', object)
      .where('id', '=', fieldId)
      .where('archived_at', 'is', null)
      .execute();
  }
}

/** The removed fields whose answers are still stored and which were removed before `removedBefore` (so are due to be purged). */
export async function listFieldsDueForPurge(
  db: Db,
  accountId: string,
  removedBefore: Date,
): Promise<{ id: string; object: FieldObject; key: string }[]> {
  return db
    .selectFrom('field_definitions')
    .select(['id', 'object', 'key'])
    .where('account_id', '=', accountId)
    .where('archived_at', '<', removedBefore)
    .where('values_purged_at', 'is', null)
    .orderBy('id')
    .execute();
}

/** Marks removed fields as purged: their answers have been deleted. */
export async function markFieldValuesPurged(
  db: Db,
  accountId: string,
  fieldIds: string[],
  purgedAt: Date,
): Promise<void> {
  if (fieldIds.length === 0) return;
  await db
    .updateTable('field_definitions')
    .set({ values_purged_at: purgedAt })
    .where('account_id', '=', accountId)
    .where('id', 'in', fieldIds)
    .execute();
}
