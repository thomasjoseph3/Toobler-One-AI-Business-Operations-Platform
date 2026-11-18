import { defineModule } from '../../../kernel/module-system/define';
import { fieldsRoutes } from './routes/fields.routes';
import { purgeRemovedFieldsForBusiness } from './services/purge-removed-fields.service';

/**
 * Custom fields (F09): what each business adds to its contacts, companies and leads. A core module: always on. It requires nothing; the contacts,
 * companies and leads modules require it, to check the values of their custom fields. Built in slices of at most 2 routes
 * (docs/features/F09-custom-fields.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.fields',
  kind: 'core',
  jobs: [
    {
      // Runs by itself every night. It has no business of its own: it queues one purge per business.
      name: 'fields.purge_removed',
      schedule: '30 3 * * *',
      run: async (job) => {
        for (const accountId of await job.listAccountIds()) {
          await job.enqueueJob('fields.purge_removed_for_business', { accountId });
        }
      },
    },
    {
      // One business: the answers of fields removed over 30 days ago are deleted for good. Safe to run twice.
      name: 'fields.purge_removed_for_business',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const purged = await purgeRemovedFieldsForBusiness(job.accountContext, new Date());
        if (purged > 0) job.logger.info({ purged }, 'purged the answers of removed custom fields');
      },
    },
  ],
  routes: (app) => {
    fieldsRoutes(app);
  },
});
