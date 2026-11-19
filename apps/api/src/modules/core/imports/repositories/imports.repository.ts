import type { ImportCounts, ImportReportRow, ImportStatus } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `imports` table (spreadsheet imports, F12). Every function names the business. Run each inside the business's fence.

/** An import as the database holds it, without the rows (they are read only by the run and the preview). */
export interface ImportRow {
  id: string;
  fileName: string;
  status: ImportStatus;
  headers: string[];
  rowCount: number;
  mapping: Array<string | null> | null;
  defaultCountry: string;
  counts: Partial<ImportCounts>;
  report: ImportReportRow[];
  processed: number;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

const IMPORT_COLUMNS = [
  'id',
  'file_name',
  'status',
  'headers',
  'row_count',
  'mapping',
  'default_country',
  'counts',
  'report',
  'processed',
  'error',
  'created_at',
  'finished_at',
] as const;

/** Turns a database row into an ImportRow. */
function toImportRow(row: {
  id: string;
  file_name: string;
  status: ImportStatus;
  headers: string[];
  row_count: number;
  mapping: Array<string | null> | null;
  default_country: string;
  counts: Record<string, number>;
  report: Array<{ row: number; reason: string; message: string }>;
  processed: number;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
}): ImportRow {
  return {
    id: row.id,
    fileName: row.file_name,
    status: row.status,
    headers: row.headers,
    rowCount: row.row_count,
    mapping: row.mapping,
    defaultCountry: row.default_country,
    counts: row.counts,
    report: row.report as ImportReportRow[],
    processed: row.processed,
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/** Adds an import with its rows, and the columns' guessed meaning as the first mapping. */
export async function insertImport(
  db: Db,
  options: {
    id: string;
    accountId: string;
    fileName: string;
    headers: string[];
    rows: string[][];
    mapping: Array<string | null>;
    defaultCountry: string;
    byUserId: string;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: options.actor.kind, id: options.actor.id };
  await db
    .insertInto('imports')
    .values({
      id: options.id,
      account_id: options.accountId,
      object: 'contact',
      file_name: options.fileName,
      headers: JSON.stringify(options.headers),
      data: JSON.stringify(options.rows),
      row_count: options.rows.length,
      mapping: JSON.stringify(options.mapping),
      default_country: options.defaultCountry,
      by_user_id: options.byUserId,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** One import of the business, or undefined (also for another business's import). */
export async function findImportById(db: Db, accountId: string, importId: string): Promise<ImportRow | undefined> {
  const row = await db
    .selectFrom('imports')
    .select(IMPORT_COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', importId)
    .executeTakeFirst();
  return row === undefined ? undefined : toImportRow(row);
}

/** The rows of an import (a list of texts per row), or undefined when the import is unknown or its rows were already deleted (the run ended). */
export async function findImportData(db: Db, accountId: string, importId: string): Promise<string[][] | undefined> {
  const row = await db
    .selectFrom('imports')
    .select('data')
    .where('account_id', '=', accountId)
    .where('id', '=', importId)
    .executeTakeFirst();
  return row?.data ?? undefined;
}

/** The first few rows, for the preview, without reading the whole file's rows into the application. */
export async function findImportSample(
  db: Db,
  accountId: string,
  importId: string,
  count: number,
): Promise<string[][]> {
  const row = await db
    .selectFrom('imports')
    .select(({ ref }) => [ref('data').as('data')])
    .where('account_id', '=', accountId)
    .where('id', '=', importId)
    .executeTakeFirst();
  return (row?.data ?? []).slice(0, count);
}

/** Saves the columns' meaning and the counts for it, and makes the import ready to run. Only an import that is not running or finished can be re-mapped. Returns false otherwise. */
export async function saveMapping(
  db: Db,
  options: {
    accountId: string;
    importId: string;
    mapping: Array<string | null>;
    counts: ImportCounts;
    report: ImportReportRow[];
    actor: Actor;
  },
): Promise<boolean> {
  const row = await db
    .updateTable('imports')
    .set({
      mapping: JSON.stringify(options.mapping),
      counts: JSON.stringify(options.counts),
      report: JSON.stringify(options.report),
      status: 'ready',
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.importId)
    .where('status', 'in', ['uploaded', 'ready'])
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** Starts a ready import: it becomes running with zero rows done and empty counts. Returns false when it was not ready (already started, finished, or unknown). */
export async function markRunning(
  db: Db,
  options: { accountId: string; importId: string; at: Date; actor: Actor },
): Promise<boolean> {
  const row = await db
    .updateTable('imports')
    .set({
      status: 'running',
      processed: 0,
      counts: JSON.stringify({ newContacts: 0, matchedContacts: 0, skipped: 0 }),
      report: '[]',
      error: null,
      started_at: options.at,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.importId)
    .where('status', '=', 'ready')
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** Writes how far the run has got: rows done, the counts so far and the report so far. */
export async function saveProgress(
  db: Db,
  options: { accountId: string; importId: string; processed: number; counts: ImportCounts; report: ImportReportRow[] },
): Promise<void> {
  await db
    .updateTable('imports')
    .set({
      processed: options.processed,
      counts: JSON.stringify(options.counts),
      report: JSON.stringify(options.report),
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.importId)
    .execute();
}

/** Ends the run: done, with the personal data of the rows deleted (only the counts and the report stay). */
export async function markDone(db: Db, options: { accountId: string; importId: string; at: Date }): Promise<void> {
  await db
    .updateTable('imports')
    .set({ status: 'done', data: null, finished_at: options.at })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.importId)
    .execute();
}

/** Marks the run as failed, with a short sentence (the rows are kept so the run can be tried again by the job's retry). */
export async function markFailed(
  db: Db,
  options: { accountId: string; importId: string; message: string },
): Promise<void> {
  await db
    .updateTable('imports')
    .set({ status: 'failed', error: options.message.slice(0, 500) })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.importId)
    .execute();
}

/** Puts a failed import back to running so the job's retry carries on from the rows already done. Returns false when it was not failed or running. */
export async function resumeRunning(db: Db, options: { accountId: string; importId: string }): Promise<boolean> {
  const row = await db
    .updateTable('imports')
    .set({ status: 'running', error: null })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.importId)
    .where('status', 'in', ['running', 'failed'])
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
