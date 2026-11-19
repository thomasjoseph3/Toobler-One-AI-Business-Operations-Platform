import type { ExportObject, ExportStatus } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `exports` table (CSV exports, F12). Every function names the business. Run each inside the business's fence.

/** An export as the database holds it, without the file's bytes (only the download reads them). */
export interface ExportRow {
  id: string;
  object: ExportObject;
  query: string;
  status: ExportStatus;
  fileName: string | null;
  rowCount: number | null;
  expiresAt: Date | null;
  hasContent: boolean;
  error: string | null;
  byUserId: string;
  createdAt: Date;
}

/** Turns a database row into an ExportRow. */
function toExportRow(row: {
  id: string;
  object: ExportObject;
  query: string;
  status: ExportStatus;
  file_name: string | null;
  row_count: number | null;
  expires_at: Date | null;
  has_content: boolean | number;
  error: string | null;
  by_user_id: string;
  created_at: Date;
}): ExportRow {
  return {
    id: row.id,
    object: row.object,
    query: row.query,
    status: row.status,
    fileName: row.file_name,
    rowCount: row.row_count,
    expiresAt: row.expires_at,
    hasContent: Boolean(row.has_content),
    error: row.error,
    byUserId: row.by_user_id,
    createdAt: row.created_at,
  };
}

/** The columns of an export read without its bytes. */
const EXPORT_COLUMNS = [
  'id',
  'object',
  'query',
  'status',
  'file_name',
  'row_count',
  'expires_at',
  'error',
  'by_user_id',
  'created_at',
] as const;

/** Adds an export, waiting to be built. */
export async function insertExport(
  db: Db,
  options: { id: string; accountId: string; object: ExportObject; query: string; byUserId: string; actor: Actor },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .insertInto('exports')
    .values({
      id: options.id,
      account_id: options.accountId,
      object: options.object,
      query: options.query,
      by_user_id: options.byUserId,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** One export of the business without its file, or undefined (also for another business's export). */
export async function findExportById(db: Db, accountId: string, exportId: string): Promise<ExportRow | undefined> {
  const row = await db
    .selectFrom('exports')
    .select([...EXPORT_COLUMNS, (expression) => expression('content', 'is not', null).as('has_content')])
    .where('account_id', '=', accountId)
    .where('id', '=', exportId)
    .executeTakeFirst();
  return row === undefined ? undefined : toExportRow(row);
}

/** The file of a finished export, or undefined when there is none (not built yet, or already deleted after 24 hours). */
export async function findExportContent(db: Db, accountId: string, exportId: string): Promise<Buffer | undefined> {
  const row = await db
    .selectFrom('exports')
    .select('content')
    .where('account_id', '=', accountId)
    .where('id', '=', exportId)
    .executeTakeFirst();
  return row?.content ?? undefined;
}

/** Marks the export as being built (a retried job starts here again). */
export async function markRunning(db: Db, accountId: string, exportId: string): Promise<void> {
  await db
    .updateTable('exports')
    .set({ status: 'running', error: null })
    .where('account_id', '=', accountId)
    .where('id', '=', exportId)
    .where('status', 'in', ['queued', 'running', 'failed'])
    .execute();
}

/** Saves the finished file with its name, row count and the moment it stops being available. */
export async function markDone(
  db: Db,
  options: {
    accountId: string;
    exportId: string;
    fileName: string;
    content: Buffer;
    rowCount: number;
    expiresAt: Date;
  },
): Promise<void> {
  await db
    .updateTable('exports')
    .set({
      status: 'done',
      file_name: options.fileName,
      content: options.content,
      row_count: options.rowCount,
      expires_at: options.expiresAt,
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.exportId)
    .execute();
}

/** Marks the export as failed, with a short sentence. */
export async function markFailed(
  db: Db,
  options: { accountId: string; exportId: string; message: string },
): Promise<void> {
  await db
    .updateTable('exports')
    .set({ status: 'failed', error: options.message.slice(0, 500) })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.exportId)
    .execute();
}

/** Deletes the files of exports that have expired (the row stays as the record that the export happened). Returns how many files were deleted. */
export async function deleteExpiredContent(db: Db, accountId: string, now: Date): Promise<number> {
  const rows = await db
    .updateTable('exports')
    .set({ content: null })
    .where('account_id', '=', accountId)
    .where('expires_at', '<', now)
    .where('content', 'is not', null)
    .returning('id')
    .execute();
  return rows.length;
}
