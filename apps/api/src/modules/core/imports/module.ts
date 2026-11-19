import { defineModule } from '../../../kernel/module-system/define';
import { importsRoutes } from './routes/imports.routes';
import { runImport } from './services/import-run.service';

/**
 * Spreadsheet imports of contacts (F12): upload a CSV or Excel file, check which column is which, run, read the report. Managers only. A core module: always
 * on. It saves people through the contacts module (the same matching as the AI: phone, then email) and companies through the companies module.
 * Built as one unit (docs/features/F12-import-and-export.md).
 */
export default defineModule({
  id: 'core.imports',
  kind: 'core',
  requires: ['core.auth', 'core.contacts', 'core.companies', 'core.fields'],
  jobs: [
    {
      // Carries out one import in the background, a chunk of rows at a time. Safe to run again: it carries on from the rows already done, and a person
      // who was already saved matches themselves instead of being added twice.
      name: 'imports.run',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const { importId } = job.data;
        if (typeof importId !== 'string') throw new Error('This job needs an importId');
        await runImport(job.accountContext, importId);
      },
    },
  ],
  routes: async (app) => {
    await importsRoutes(app);
  },
});
