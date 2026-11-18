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
