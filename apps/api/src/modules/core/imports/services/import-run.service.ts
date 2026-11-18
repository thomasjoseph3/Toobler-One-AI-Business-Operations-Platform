import { MAX_REPORT_ROWS, readImportRow, type ImportCounts, type ImportReportRow } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { AccountContext, Actor } from '../../../../kernel/context';
import { findOrCreateCompanyByName } from '../../companies';
import { applyImportedContact, setContactCompanyIfNone } from '../../contacts';
import { findFieldDefinitions } from '../../fields';
import * as importsRepository from '../repositories/imports.repository';

/** How many rows one database transaction saves (and after which the progress is written). A bigger chunk is faster; a smaller one shows progress sooner. */
const RUN_CHUNK_ROWS = 250;

/** What a run did to the rows it has looked at. */
interface RunTotals {
  counts: ImportCounts;
  report: ImportReportRow[];
}

/**
 * Carries out an import (the background job `imports.run`): saves the rows through the mapping, a chunk at a time, each chunk and its progress in ONE
 * transaction. A retried job carries on from the rows already done, and a row that was already saved matches itself, so nothing is duplicated. A person who is
 * already in the business is matched by phone then email and updated, never added twice. A company named in the file is found or made, and the contact is put in it
 * only if it has none. When the last row is done the rows (personal data) are deleted and only the counts and the report of skipped rows stay.
 */
export async function runImport(accountContext: AccountContext, importId: string): Promise<void> {
  const { accountId } = accountContext;
  const actor: Actor = { kind: 'import', id: importId };

  const loaded = await accountContext.runInAccountTransaction(async (transaction) => {
    const row = await importsRepository.findImportById(transaction, accountId, importId);
    if (!row || row.status === 'done') return undefined;
    // A retry of a run that failed or was cut short carries on
    if (row.status !== 'running') await importsRepository.resumeRunning(transaction, { accountId, importId });
    const rows = await importsRepository.findImportData(transaction, accountId, importId);
    const definitions = await findFieldDefinitions(transaction, accountId, 'contact');
    return { row, rows, definitions };
  });
  if (!loaded) return;
  const { row, rows, definitions } = loaded;
  if (rows === undefined || row.mapping === null) {
    await accountContext.runInAccountTransaction((transaction) =>
      importsRepository.markFailed(transaction, {
        accountId,
        importId,
        message: 'The rows of this import are no longer there.',
      }),
    );
    return;
  }

  const totals: RunTotals = {
    counts: {
      newContacts: row.counts.newContacts ?? 0,
      matchedContacts: row.counts.matchedContacts ?? 0,
      skipped: row.counts.skipped ?? 0,
    },
    report: [...row.report],
  };
  const mapping = row.mapping;
  const companyColumnIsMapped = mapping.includes('company');

  try {
    for (let start = row.processed; start < rows.length; start += RUN_CHUNK_ROWS) {
      const importedAt = new Date();
      await accountContext.runInAccountTransaction(async (transaction) => {
        for (const [offset, cells] of rows.slice(start, start + RUN_CHUNK_ROWS).entries()) {
          if (cells.every((cell) => cell === '')) continue;
          const readRow = readImportRow(cells, mapping);
          const applied = await applyImportedContact(transaction, {
            accountId,
            defaultCountry: row.defaultCountry,
            actor,
            row: readRow,
            definitions,
            importedAt,
          });
          if (applied.kind === 'skipped') {
            totals.counts.skipped += 1;
            if (totals.report.length < MAX_REPORT_ROWS) {
              totals.report.push({ row: start + offset + 2, reason: applied.reason, message: applied.message });
            }
            continue;
          }
          if (applied.kind === 'created') totals.counts.newContacts += 1;
          else totals.counts.matchedContacts += 1;
          if (companyColumnIsMapped && readRow.company !== undefined) {
            const company = await findOrCreateCompanyByName(transaction, { accountId, name: readRow.company, actor });
            if (company) {
              await setContactCompanyIfNone(transaction, {
                accountId,
                contactId: applied.contactId,
                companyId: company.companyId,
                actor,
              });
            }
          }
        }
        await importsRepository.saveProgress(transaction, {
          accountId,
          importId,
          processed: Math.min(start + RUN_CHUNK_ROWS, rows.length),
          counts: totals.counts,
          report: totals.report,
        });
      });
    }
  } catch (error) {
    await accountContext.runInAccountTransaction((transaction) =>
      importsRepository.markFailed(transaction, {
        accountId,
        importId,
        message: 'The import stopped before it finished. It will try again.',
      }),
    );
    throw error;
  }

  await accountContext.runInAccountTransaction(async (transaction) => {
    await importsRepository.markDone(transaction, { accountId, importId, at: new Date() });
    await writeActivityLog(transaction, {
      accountId,
      actor,
      kind: 'imports.finished',
      // The numbers are counts, never anyone's details
      details: { recordType: 'import', recordId: importId, fields: ['counts'] },
    });
  });
}
