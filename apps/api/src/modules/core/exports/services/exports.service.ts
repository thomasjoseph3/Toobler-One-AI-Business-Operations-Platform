import {
  listCompaniesQuerySchema,
  listContactsQuerySchema,
  listLeadsQuerySchema,
  type CreateExportRequest,
  type Export,
  type ExportObject,
} from '@toobler-one/shared';
import type { ZodType } from 'zod';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as exportsRepository from '../repositories/exports.repository';
import type { ExportRow } from '../repositories/exports.repository';

/** The list rules each kind of export is read with: the same address query the list itself takes. */
const LIST_QUERY_SCHEMAS: Record<ExportObject, ZodType> = {
  contact: listContactsQuerySchema,
  company: listCompaniesQuerySchema,
  lead: listLeadsQuerySchema,
};

/**
 * Checks an export's list query against the list's own rules and returns it read as a list request. 400 INVALID_QUERY when the query is not one that list takes
 * (an unknown word, a wrong value), and 400 when it asks for the board of leads (an export is a list). A bad `filters` is checked by the list's own reader when the file is built.
 */
export function readExportQuery(object: ExportObject, queryText: string): unknown {
  const result = LIST_QUERY_SCHEMAS[object].safeParse(Object.fromEntries(new URLSearchParams(queryText)));
  if (!result.success) throw new ApiError(400, 'INVALID_QUERY', 'That list query is not one this list understands.');
  const parsed = result.data as { view?: string };
  if (object === 'lead' && parsed.view === 'board') {
    throw new ApiError(400, 'INVALID_QUERY', 'Export the leads as a list, not as the board.');
  }
  return parsed;
}

/** Turns a stored export into the Export the API answers with. */
function toExport(row: ExportRow, now: Date): Export {
  const isAvailable =
    row.status === 'done' && row.hasContent && row.expiresAt !== null && row.expiresAt.getTime() > now.getTime();
  return {
    id: row.id,
    object: row.object,
    status: row.status,
    fileName: row.fileName,
    rowCount: row.rowCount,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    downloadPath: isAvailable ? `/api/v1/exports/${row.id}/download` : null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/** CSV exports of contacts, companies and leads (F12), for managers. The routes call this; a background job builds the file. */
export function createExportsService({
  database,
  enqueueJob,
}: {
  database: Database;
  enqueueJob: (jobName: string, data: { accountId: string; exportId: string }) => Promise<void>;
}) {
  return {
    /**
     * Asks for an export of a list (the list's own address query says which contacts, companies or leads). A background job builds the CSV and emails the manager a
     * link; answers at once. 400 INVALID_QUERY when the query is not one that list takes.
     */
    async requestExport(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateExportRequest,
    ): Promise<Export> {
      readExportQuery(request.object, request.query);
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const exportId = uuidv7();
      const row = await database.runInAccountTransaction(accountId, async (transaction) => {
        await exportsRepository.insertExport(transaction, {
          id: exportId,
          accountId,
          object: request.object,
          query: request.query,
          byUserId: principal.userId,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'exports.requested',
          details: { recordType: 'export', recordId: exportId, fields: [request.object] },
        });
        return exportsRepository.findExportById(transaction, accountId, exportId);
      });
      if (!row) throw new Error('The export that was just saved could not be read');
      // After the transaction is saved, so the job always finds the export
      await enqueueJob('exports.build', { accountId, exportId });
      return toExport(row, new Date());
    },

    /** One export with its status and, while the file is built and not expired, the address to download it from. 404 for an unknown export or another business's. */
    async getExport(principal: Pick<Principal, 'accountId'>, exportId: string): Promise<Export> {
      const row = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        exportsRepository.findExportById(transaction, principal.accountId, exportId),
      );
      if (!row) throw notFound('That export');
      return toExport(row, new Date());
    },

    /**
     * The file of a finished export, for the download. 404 for an unknown export or another business's; 409 EXPORT_NOT_READY while it is being built (or if it
     * failed); 410 EXPORT_EXPIRED once its 24 hours are over (the file is gone). Writes an activity line.
     */
    async downloadExport(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      exportId: string,
    ): Promise<{ fileName: string; content: Buffer }> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const row = await exportsRepository.findExportById(transaction, accountId, exportId);
        if (!row) throw notFound('That export');
        if (row.status !== 'done') throw conflict('EXPORT_NOT_READY', 'The export is not ready yet.');
        const content = await exportsRepository.findExportContent(transaction, accountId, exportId);
        if (!content || row.expiresAt === null || row.expiresAt.getTime() <= Date.now()) {
          throw new ApiError(410, 'EXPORT_EXPIRED', 'That export has expired. Export the list again.');
        }
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'exports.downloaded',
          details: { recordType: 'export', recordId: exportId, fields: [row.object] },
        });
        return { fileName: row.fileName ?? 'export.csv', content };
      });
    },
  };
}
