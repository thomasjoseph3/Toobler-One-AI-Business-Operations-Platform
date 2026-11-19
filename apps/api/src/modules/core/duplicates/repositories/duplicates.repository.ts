import { sql } from 'kysely';
import type { DuplicateObject, DuplicateReason } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { uuidv7 } from '../../../../kernel/ids';

// The SQL for the `duplicate_suggestions` table (F13). Every function names the business. Run each inside the business's fence.

/** One suggestion as the database holds it. */
export interface DuplicateSuggestionRow {
  id: string;
  object: DuplicateObject;
  aId: string;
  bId: string;
  reasons: DuplicateReason[];
  status: 'open' | 'dismissed' | 'merged';
  createdAt: Date;
}

const SUGGESTION_COLUMNS = ['id', 'object', 'a_id', 'b_id', 'reasons', 'status', 'created_at'] as const;

/** Turns a database row into a DuplicateSuggestionRow. */
function toSuggestionRow(row: {
  id: string;
  object: DuplicateObject;
  a_id: string;
  b_id: string;
  reasons: string[];
  status: 'open' | 'dismissed' | 'merged';
  created_at: Date;
}): DuplicateSuggestionRow {
  return {
    id: row.id,
    object: row.object,
    aId: row.a_id,
    bId: row.b_id,
    reasons: row.reasons as DuplicateReason[],
    status: row.status,
    createdAt: row.created_at,
  };
}

/** How many pairs are saved in one statement. */
const INSERT_CHUNK_SIZE = 500;

/**
 * Saves the pairs the nightly job found. A pair that is new becomes open; a pair that is still open gets its reasons refreshed; a pair staff
 * already dismissed or merged is left exactly as it is, so a dismissed pair never comes back. Safe to run twice. Returns how many pairs were new.
 */
export async function saveFoundPairs(
  db: Db,
  options: {
    accountId: string;
    object: DuplicateObject;
    pairs: Array<{ firstId: string; secondId: string; reasons: string[] }>;
    actor: Actor;
  },
): Promise<number> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  let newPairs = 0;
  for (let start = 0; start < options.pairs.length; start += INSERT_CHUNK_SIZE) {
    const chunk = options.pairs.slice(start, start + INSERT_CHUNK_SIZE);
    const saved = await db
      .insertInto('duplicate_suggestions')
      .values(
        chunk.map((pair) => ({
          id: uuidv7(),
          account_id: options.accountId,
          object: options.object,
          a_id: pair.firstId,
          b_id: pair.secondId,
          reasons: pair.reasons,
          created_by: actorStamp,
          updated_by: actorStamp,
        })),
      )
      .onConflict((conflict) =>
        conflict
          .columns(['account_id', 'object', 'a_id', 'b_id'])
          .doUpdateSet((expression) => ({ reasons: expression.ref('excluded.reasons') }))
          .where('duplicate_suggestions.status', '=', 'open'),
      )
      .returning(sql<boolean>`(xmax = 0)`.as('is_new'))
      .execute();
    newPairs += saved.filter((row) => row.is_new).length;
  }
  return newPairs;
}

/** The most open pairs one screen shows. */
export const MOST_OPEN_PAIRS = 100;

/** The open pairs of one kind whose two records are both still live, oldest first (so the list does not shuffle), at most MOST_OPEN_PAIRS. */
export async function listOpenSuggestions(
  db: Db,
  accountId: string,
  object: DuplicateObject,
): Promise<DuplicateSuggestionRow[]> {
  const recordTable = sql.table(object === 'contact' ? 'contacts' : 'companies');
  const rows = await db
    .selectFrom('duplicate_suggestions')
    .select(SUGGESTION_COLUMNS)
    .where('account_id', '=', accountId)
    .where('object', '=', object)
    .where('status', '=', 'open')
    .where(
      sql<boolean>`exists (select 1 from ${recordTable} as record where record.account_id = duplicate_suggestions.account_id and record.id = duplicate_suggestions.a_id and record.deleted_at is null)
        and exists (select 1 from ${recordTable} as record where record.account_id = duplicate_suggestions.account_id and record.id = duplicate_suggestions.b_id and record.deleted_at is null)`,
    )
    .orderBy('created_at')
    .orderBy('id')
    .limit(MOST_OPEN_PAIRS)
    .execute();
  return rows.map(toSuggestionRow);
}

/** How many open pairs of one kind there are (for the count on the Contacts page), with both records still live. */
export async function countOpenSuggestions(db: Db, accountId: string, object: DuplicateObject): Promise<number> {
  return (await listOpenSuggestions(db, accountId, object)).length;
}

/** One suggestion of the business, locked until the end of the transaction (so two decisions at once take turns), or undefined. */
export async function findSuggestionForUpdate(
  db: Db,
  accountId: string,
  suggestionId: string,
): Promise<DuplicateSuggestionRow | undefined> {
  const row = await db
    .selectFrom('duplicate_suggestions')
    .select(SUGGESTION_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', suggestionId)
    .forUpdate()
    .executeTakeFirst();
  return row ? toSuggestionRow(row) : undefined;
}

/** Records that a person decided an open suggestion ("dismissed" or "merged"). */
export async function markSuggestionDecided(
  db: Db,
  options: { accountId: string; suggestionId: string; status: 'dismissed' | 'merged'; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .updateTable('duplicate_suggestions')
    .set({ status: options.status, decided_by: actorStamp, decided_at: new Date(), updated_by: actorStamp })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.suggestionId)
    .execute();
}

/**
 * After a record was merged away, closes the other open suggestions that mention it (they point at a record that is gone). They are marked
 * "merged": the question they asked is settled.
 */
export async function closeOpenSuggestionsAbout(
  db: Db,
  options: { accountId: string; object: DuplicateObject; recordId: string; actor: Actor },
): Promise<number> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  const rows = await db
    .updateTable('duplicate_suggestions')
    .set({ status: 'merged', decided_by: actorStamp, decided_at: new Date(), updated_by: actorStamp })
    .where('account_id', '=', options.accountId)
    .where('object', '=', options.object)
    .where('status', '=', 'open')
    .where((expression) =>
      expression.or([expression('a_id', '=', options.recordId), expression('b_id', '=', options.recordId)]),
    )
    .returning('id')
    .execute();
  return rows.length;
}
