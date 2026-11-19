import {
  checkImportMapping,
  guessColumnTargets,
  IMPORT_PREVIEW_ROWS,
  MAX_REPORT_ROWS,
  readImportRow,
  type FieldDefinition,
  type Import,
  type ImportCounts,
  type ImportReportRow,
  type SetImportMappingRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { previewImportedContact } from '../../contacts';
import { findFieldDefinitions } from '../../fields';
import { readSpreadsheet } from '../helpers/read-spreadsheet';
import * as importsRepository from '../repositories/imports.repository';
import type { ImportRow } from '../repositories/imports.repository';

/** How many rows are looked at in one database transaction while counting. */
const PREVIEW_CHUNK_ROWS = 500;

/** The counts for an import that has none yet. */
const NO_COUNTS: ImportCounts = { newContacts: 0, matchedContacts: 0, skipped: 0 };

/** Turns a stored import into the Import the API answers with. The sample rows are only given while the file waits to be run. */
function toImport(row: ImportRow, sample: string[][]): Import {
  const hasCounts = row.counts.newContacts !== undefined;
  return {
    id: row.id,
    fileName: row.fileName,
    status: row.status,
    rowCount: row.rowCount,
    headers: row.headers,
    sample,
    targets: row.mapping ?? row.headers.map(() => null),
    counts: hasCounts
      ? {
          newContacts: row.counts.newContacts ?? 0,
          matchedContacts: row.counts.matchedContacts ?? 0,
          skipped: row.counts.skipped ?? 0,
        }
      : null,
    processed: row.processed,
    report: row.report,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** Says which sample rows to give for an import in this state: the first few while it waits, none once it runs. */
async function readSampleFor(transaction: Db, accountId: string, row: ImportRow): Promise<string[][]> {
  return row.status === 'uploaded' || row.status === 'ready'
    ? importsRepository.findImportSample(transaction, accountId, row.id, IMPORT_PREVIEW_ROWS)
    : [];
}

/**
 * Spreadsheet imports of contacts (F12), for managers: upload a file, check which column is which, run, read the report. The routes call this.
 * The rows wait in the database while the columns are checked and are deleted when the run ends.
 */
export function createImportsService({
  database,
  enqueueJob,
}: {
  database: Database;
  enqueueJob: (jobName: string, data: { accountId: string; importId: string }) => Promise<void>;
}) {
  /** Works out what the mapping would do to every row, without saving any contact: new, matching someone already there, or skipped (with the first few reasons). */
  async function countRows(
    accountId: string,
    importId: string,
    row: ImportRow,
    mapping: Array<string | null>,
    definitions: readonly FieldDefinition[],
  ): Promise<{ counts: ImportCounts; report: ImportReportRow[] }> {
    const counts: ImportCounts = { ...NO_COUNTS };
    const report: ImportReportRow[] = [];
    // The same person twice in one file is one contact: the second time counts as a match, as the run will treat it
    const seen = new Set<string>();
    const rows =
      (await database.runInAccountTransaction(accountId, (transaction) =>
        importsRepository.findImportData(transaction, accountId, importId),
      )) ?? [];
    for (let start = 0; start < rows.length; start += PREVIEW_CHUNK_ROWS) {
      await database.runInAccountTransaction(accountId, async (transaction) => {
        for (const [offset, cells] of rows.slice(start, start + PREVIEW_CHUNK_ROWS).entries()) {
          if (cells.every((cell) => cell === '')) continue;
          const preview = await previewImportedContact(transaction, {
            accountId,
            defaultCountry: row.defaultCountry,
            row: readImportRow(cells, mapping),
            definitions,
          });
          if (preview.kind === 'skipped') {
            counts.skipped += 1;
            if (report.length < MAX_REPORT_ROWS)
              report.push({ row: start + offset + 2, reason: preview.reason, message: preview.message });
            continue;
          }
          const alreadySeen = preview.identityKeys.some((key) => seen.has(key));
          for (const key of preview.identityKeys) seen.add(key);
          if (preview.kind === 'matched' || alreadySeen) counts.matchedContacts += 1;
          else counts.newContacts += 1;
        }
      });
    }
    return { counts, report };
  }

  return {
    /**
     * Reads an uploaded file (CSV or Excel, up to 10 MB and 50,000 rows), guesses which column is which, keeps the rows and answers with the preview: the column
     * names, the first rows and the guess. Nothing is imported yet. 400 for a file that is not a spreadsheet, is empty, or has too many columns; 413 for too many rows.
     */
    async createImport(
      principal: Pick<Principal, 'accountId' | 'userId' | 'defaultCountry'>,
      file: { fileName: string; content: Buffer },
    ): Promise<Import> {
      const spreadsheet = await readSpreadsheet(file.content);
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const importId = uuidv7();
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const definitions = await findFieldDefinitions(transaction, accountId, 'contact');
        await importsRepository.insertImport(transaction, {
          id: importId,
          accountId,
          fileName: file.fileName.slice(0, 255),
          headers: spreadsheet.headers,
          rows: spreadsheet.rows,
          mapping: guessColumnTargets(spreadsheet.headers, definitions),
          defaultCountry: principal.defaultCountry,
          byUserId: principal.userId,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'imports.uploaded',
          details: { recordType: 'import', recordId: importId, fields: ['file'] },
        });
        const row = await importsRepository.findImportById(transaction, accountId, importId);
        if (!row) throw new Error('The import that was just saved could not be read');
        return toImport(row, spreadsheet.rows.slice(0, IMPORT_PREVIEW_ROWS));
      });
    },

    /**
     * Sets which column is which and answers with the counts that mapping gives: how many new contacts, how many match someone already there (they are updated,
     * never duplicated) and how many rows are skipped, with the first reasons. 400 INVALID_MAPPING (with the problem in words) for a mapping that makes no sense,
     * 409 when the import is already running or finished, 404 for an unknown import or another business's.
     */
    async setMapping(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      importId: string,
      request: SetImportMappingRequest,
    ): Promise<Import> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const { row, definitions } = await database.runInAccountTransaction(accountId, async (transaction) => {
        const found = await importsRepository.findImportById(transaction, accountId, importId);
        if (!found) throw notFound('That import');
        return { row: found, definitions: await findFieldDefinitions(transaction, accountId, 'contact') };
      });
      if (row.status !== 'uploaded' && row.status !== 'ready') {
        throw conflict(
          'IMPORT_ALREADY_STARTED',
          'This import has already been started, so its columns cannot be changed.',
        );
      }
      const problems = checkImportMapping(request.targets, row.headers.length, definitions);
      const firstProblem = problems[0];
      if (firstProblem) throw new ApiError(400, 'INVALID_MAPPING', firstProblem.message, { problems });

      const { counts, report } = await countRows(accountId, importId, row, request.targets, definitions);
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (
          !(await importsRepository.saveMapping(transaction, {
            accountId,
            importId,
            mapping: request.targets,
            counts,
            report,
            actor,
          }))
        ) {
          throw conflict(
            'IMPORT_ALREADY_STARTED',
            'This import has already been started, so its columns cannot be changed.',
          );
        }
        const saved = await importsRepository.findImportById(transaction, accountId, importId);
        if (!saved) throw notFound('That import');
        return toImport(saved, await readSampleFor(transaction, accountId, saved));
      });
    },

    /**
     * Starts the import: a background job saves the rows, a few hundred at a time. Only an import whose columns were checked (`ready`) can start (409
     * IMPORT_NOT_READY otherwise, which also stops the same file being run twice). Answers at once with the import as running.
     */
    async runImport(principal: Pick<Principal, 'accountId' | 'userId'>, importId: string): Promise<Import> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const started = await database.runInAccountTransaction(accountId, async (transaction) => {
        const found = await importsRepository.findImportById(transaction, accountId, importId);
        if (!found) throw notFound('That import');
        if (!(await importsRepository.markRunning(transaction, { accountId, importId, at: new Date(), actor }))) {
          throw conflict('IMPORT_NOT_READY', 'Check the columns first, and an import can only be run once.');
        }
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'imports.started',
          details: { recordType: 'import', recordId: importId, fields: ['rows'] },
        });
        return importsRepository.findImportById(transaction, accountId, importId);
      });
      if (!started) throw notFound('That import');
      // After the transaction is saved, so the job always finds the running import
      await enqueueJob('imports.run', { accountId, importId });
      return toImport(started, []);
    },

    /** One import with its progress, counts and report. 404 for an unknown import or another business's. */
    async getImport(principal: Pick<Principal, 'accountId'>, importId: string): Promise<Import> {
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const found = await importsRepository.findImportById(transaction, accountId, importId);
        if (!found) throw notFound('That import');
        return toImport(found, await readSampleFor(transaction, accountId, found));
      });
    },
  };
}

export type ImportsService = ReturnType<typeof createImportsService>;
