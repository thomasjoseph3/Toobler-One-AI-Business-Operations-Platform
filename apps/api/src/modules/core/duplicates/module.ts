import { defineModule } from '../../../kernel/module-system/define';
import { duplicatesRoutes } from './routes/duplicates.routes';
import { detectDuplicatesForBusiness } from './services/duplicates.service';

/**
 * Finds contacts and companies that are probably the same one, every night, and lets staff merge them or say "Not the same" (F13). A core module:
 * always on. It reads and moves the records of each module only through that module's `index.ts`.
 * Built as one unit (docs/features/F13-duplicates-and-merging.md).
 */
export default defineModule({
  id: 'core.duplicates',
  kind: 'core',
  requires: [
    'core.auth',
    'core.contacts',
    'core.companies',
    'core.leads',
    'core.tasks',
    'core.tickets',
    'core.activities',
    'core.conversations',
    'core.lists',
    'core.fields',
  ],
  jobs: [
    {
      // Runs by itself every night. It has no business of its own: it queues one search per business.
      name: 'duplicates.detect',
      schedule: '30 2 * * *',
      run: async (job) => {
        for (const accountId of await job.listAccountIds()) {
          await job.enqueueJob('duplicates.detect_for_business', { accountId });
        }
      },
    },
    {
      // One business: looks for contacts and companies that look like one record and saves new pairs. Safe to run twice (dismissed pairs never return).
      name: 'duplicates.detect_for_business',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const newPairs = await detectDuplicatesForBusiness(job.accountContext);
        if (newPairs > 0) job.logger.info({ newPairs }, 'found possible duplicates');
      },
    },
  ],
  routes: (app) => {
    duplicatesRoutes(app);
  },
});
