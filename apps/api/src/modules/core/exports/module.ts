import { defineModule } from '../../../kernel/module-system/define';
import { exportsRoutes } from './routes/exports.routes';
import { buildExport } from './services/export-build.service';
import * as exportsRepository from './repositories/exports.repository';

/**
 * CSV exports of contacts, companies and leads (F12), for managers: the file holds exactly what a list shows (its own search and filters), is built in the
 * background, emailed as a link to a page in the app, and kept for 24 hours. A core module: always on. It reads each list through that module's `index.ts`.
 * Built as one unit (docs/features/F12-import-and-export.md).
 */
export default defineModule({
  id: 'core.exports',
  kind: 'core',
  requires: ['core.auth', 'core.contacts', 'core.companies', 'core.leads', 'core.fields'],
  jobs: [
    {
      // Builds one export in the background and emails the manager. Safe to run again: a retry builds the file afresh.
      name: 'exports.build',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const { exportId } = job.data;
        if (typeof exportId !== 'string') throw new Error('This job needs an exportId');
        await buildExport(job.accountContext, exportId, { mail: job.services.mail, config: job.services.config });
      },
    },
    {
      // Runs by itself every hour. It has no business of its own: it queues one clean-up per business.
      name: 'exports.purge_expired',
      schedule: '15 * * * *',
      run: async (job) => {
        for (const accountId of await job.listAccountIds()) {
          await job.enqueueJob('exports.purge_expired_for_business', { accountId });
        }
      },
    },
    {
      // One business: the files of exports older than 24 hours are deleted (the row stays as the record). Safe to run twice.
      name: 'exports.purge_expired_for_business',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const { accountId } = job.accountContext;
        const deleted = await job.accountContext.runInAccountTransaction((transaction) =>
          exportsRepository.deleteExpiredContent(transaction, accountId, new Date()),
        );
        if (deleted > 0) job.logger.info({ deleted }, 'deleted the files of expired exports');
      },
    },
  ],
  routes: (app) => {
    exportsRoutes(app);
  },
});
