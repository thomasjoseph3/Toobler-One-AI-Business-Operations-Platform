import type { PrefillRunStatus, SuggestedOffering } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `prefill_runs` table (one row each time the wizard reads a website or Google listing). Every query names the
// business as well as the run (defence in depth: the database also fences every query by business).

export interface PrefillRunRow {
  id: string;
  websiteUrl: string | null;
  googleListing: string | null;
  status: PrefillRunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  pagesRead: number;
  answersFound: string[];
  answersSkipped: number;
  suggestedOfferings: SuggestedOffering[];
  createdAt: Date;
  finishedAt: Date | null;
}

const COLUMNS = [
  'id',
  'website_url',
  'google_listing_text',
  'status',
  'error_code',
  'error_message',
  'pages_read',
  'answers_found',
  'answers_skipped',
  'suggested_offerings',
  'created_at',
  'finished_at',
] as const;

function toRow(row: {
  id: string;
  website_url: string | null;
  google_listing_text: string | null;
  status: PrefillRunStatus;
  error_code: string | null;
  error_message: string | null;
  pages_read: number;
  answers_found: string[];
  answers_skipped: number;
  suggested_offerings: unknown;
  created_at: Date;
  finished_at: Date | null;
}): PrefillRunRow {
  return {
    id: row.id,
    websiteUrl: row.website_url,
    googleListing: row.google_listing_text,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    pagesRead: row.pages_read,
    answersFound: row.answers_found,
    answersSkipped: row.answers_skipped,
    suggestedOfferings: row.suggested_offerings as SuggestedOffering[],
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/** Adds a run that is waiting to be read. */
export async function insertRun(
  db: Db,
  options: { id: string; accountId: string; websiteUrl: string | null; googleListing: string | null; actor: Actor },
): Promise<void> {
  await db
    .insertInto('prefill_runs')
    .values({
      id: options.id,
      account_id: options.accountId,
      website_url: options.websiteUrl,
      google_listing_text: options.googleListing,
      created_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .execute();
}

/** One run of the business, or undefined (another business's run is undefined too). */
export async function findRun(db: Db, accountId: string, runId: string): Promise<PrefillRunRow | undefined> {
  const row = await db
    .selectFrom('prefill_runs')
    .select(COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', runId)
    .executeTakeFirst();
  return row ? toRow(row) : undefined;
}

/** How many runs the business started since the given moment (for the daily limit). */
export async function countRunsSince(db: Db, accountId: string, since: Date): Promise<number> {
  const row = await db
    .selectFrom('prefill_runs')
    .select((builder) => builder.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('created_at', '>=', since)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

/** The id of a run that is still waiting or reading and was started since the given moment, if there is one. */
export async function findActiveRunId(db: Db, accountId: string, since: Date): Promise<string | undefined> {
  const row = await db
    .selectFrom('prefill_runs')
    .select('id')
    .where('account_id', '=', accountId)
    .where('status', 'in', ['queued', 'reading'])
    .where('created_at', '>=', since)
    .executeTakeFirst();
  return row?.id;
}

/** Locks one run until the end of the transaction, so a job that runs twice does not read twice. */
export async function lockRun(db: Db, accountId: string, runId: string): Promise<PrefillRunRow | undefined> {
  const row = await db
    .selectFrom('prefill_runs')
    .select(COLUMNS)
    .where('account_id', '=', accountId)
    .where('id', '=', runId)
    .forUpdate()
    .executeTakeFirst();
  return row ? toRow(row) : undefined;
}

/** Marks a run as being read. */
export async function markReading(db: Db, accountId: string, runId: string): Promise<void> {
  await db.updateTable('prefill_runs').set({ status: 'reading' }).where('account_id', '=', accountId).where('id', '=', runId).execute();
}

/** Marks a run finished (`done`, with what was found) or `failed` (with a code and a plain message, never page text). */
export async function markFinished(
  db: Db,
  options: {
    accountId: string;
    runId: string;
    status: 'done' | 'failed';
    errorCode: string | null;
    errorMessage: string | null;
    pagesRead: number;
    answersFound: string[];
    answersSkipped: number;
    suggestedOfferings: SuggestedOffering[];
  },
): Promise<void> {
  await db
    .updateTable('prefill_runs')
    .set({
      status: options.status,
      error_code: options.errorCode,
      error_message: options.errorMessage?.slice(0, 300) ?? null,
      pages_read: options.pagesRead,
      answers_found: options.answersFound,
      answers_skipped: options.answersSkipped,
      suggested_offerings: JSON.stringify(options.suggestedOfferings),
      finished_at: new Date(),
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.runId)
    .execute();
}
