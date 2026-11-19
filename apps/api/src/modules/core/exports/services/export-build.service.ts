import {
  EXPORT_KEPT_HOURS,
  type ListCompaniesQuery,
  type ListContactsQuery,
  type ListLeadsQuery,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { AccountContext, Actor } from '../../../../kernel/context';
import { MAX_EXPORT_ROWS } from '../../../../kernel/csv/cells';
import { writeCsv, type CsvTable } from '../../../../kernel/csv/write-csv';
import type { MailSender } from '../../../../providers/mail';
import { findPeopleToEmail } from '../../auth';
import { findCompaniesForExport, findCompanyNames } from '../../companies';
import { findContactsForExport } from '../../contacts';
import { findLeadsForExport } from '../../leads';
import * as exportsRepository from '../repositories/exports.repository';
import { readExportQuery } from './exports.service';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/** The file's name: the kind of list and the day, like "contacts-2026-11-18.csv". */
function makeFileName(object: string, now: Date): string {
  return `${object === 'company' ? 'companies' : `${object}s`}-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Builds one export (the background job `exports.build`): reads exactly what the list shows (the list's own query and filters, every page, up to 50,000 rows),
 * writes it as CSV, keeps it for 24 hours, and emails the manager who asked a link to the page where the file is downloaded (signed in). Safe to run again: a retry
 * builds the file afresh. If the file cannot be built it is marked failed with a plain sentence and the error is raised so the job is retried.
 */
export async function buildExport(
  accountContext: AccountContext,
  exportId: string,
  services: { mail: MailSender; config: Pick<Config, 'webUrl'> },
): Promise<void> {
  const { accountId } = accountContext;
  const actor: Actor = { kind: 'system', id: 'exports.build' };

  const row = await accountContext.runInAccountTransaction(async (transaction) => {
    const found = await exportsRepository.findExportById(transaction, accountId, exportId);
    if (!found || found.status === 'done') return undefined;
    await exportsRepository.markRunning(transaction, accountId, exportId);
    return found;
  });
  if (!row) return;

  let table: CsvTable;
  try {
    table = await accountContext.runInAccountTransaction(async (transaction) => {
      const query = readExportQuery(row.object, row.query);
      if (row.object === 'contact') {
        return findContactsForExport(transaction, {
          accountId,
          query: query as ListContactsQuery,
          maxRows: MAX_EXPORT_ROWS,
          resolveCompanyNames: (companyIds) => findCompanyNames(transaction, { accountId, companyIds }),
        });
      }
      if (row.object === 'company') {
        return findCompaniesForExport(transaction, {
          accountId,
          query: query as ListCompaniesQuery,
          maxRows: MAX_EXPORT_ROWS,
        });
      }
      return findLeadsForExport(transaction, { accountId, query: query as ListLeadsQuery, maxRows: MAX_EXPORT_ROWS });
    });
  } catch (error) {
    await accountContext.runInAccountTransaction((transaction) =>
      exportsRepository.markFailed(transaction, {
        accountId,
        exportId,
        message: 'The export could not be built. Check the list and try again.',
      }),
    );
    throw error;
  }

  const now = new Date();
  const fileName = makeFileName(row.object, now);
  const manager = await accountContext.runInAccountTransaction(async (transaction) => {
    await exportsRepository.markDone(transaction, {
      accountId,
      exportId,
      fileName,
      content: Buffer.from(writeCsv(table), 'utf8'),
      rowCount: table.rows.length,
      expiresAt: new Date(now.getTime() + EXPORT_KEPT_HOURS * MILLISECONDS_PER_HOUR),
    });
    await writeActivityLog(transaction, {
      accountId,
      actor,
      kind: 'exports.finished',
      // The number of rows, never anyone's details
      details: { recordType: 'export', recordId: exportId, fields: [row.object, 'rows'] },
    });
    return (await findPeopleToEmail(transaction, { accountId, userIds: [row.byUserId] }))[0];
  });

  // The email is sent after the file is saved: a failed email never loses the export (the page shows it too)
  if (manager) {
    const link = `${services.config.webUrl}/exports/${exportId}`;
    await services.mail.send({
      to: manager.email,
      subject: `Your export is ready (${fileName})`,
      text: `Hello ${manager.name},\n\nYour export of ${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'} is ready. Sign in and download it here:\n${link}\n\nThe file is kept for ${EXPORT_KEPT_HOURS} hours.`,
      html: `<p>Hello ${escapeHtml(manager.name)},</p><p>Your export of ${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'} is ready. Sign in and download it here:</p><p><a href="${link}">${link}</a></p><p>The file is kept for ${EXPORT_KEPT_HOURS} hours.</p>`,
    });
  }
}

/** Escapes the characters that mean something in HTML (a name goes into the email). */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/gu,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
  );
}
