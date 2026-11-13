import { defineModule } from '../../../kernel/module-system/define';
import { aiCallLogRoutes } from './routes/ai-call-log.routes';
import { aiKeysRoutes } from './routes/ai-keys.routes';
import { aiModelsRoutes } from './routes/ai-models.routes';
import { aiSettingsRoutes } from './routes/ai-settings.routes';
import { aiUsageRoutes } from './routes/ai-usage.routes';
import { createAiHealthService } from './services/ai-health.service';
import { platformAiAccessRoutes } from './routes/platform-ai-access.routes';
import { platformAiModelsRoutes } from './routes/platform-ai-models.routes';

// When the checks run (UTC): the main check at 02:15 every night, the fallback watch at five past every hour, the clean-up at 02:45
const CHECK_HEALTH_SCHEDULE = '15 2 * * *';
const CHECK_FALLBACKS_SCHEDULE = '5 * * * *';
const CLEAN_OLD_CALLS_SCHEDULE = '45 2 * * *';

/**
 * AI models and keys: which model does which job, which keys pay for it, and what happens when one fails. A core module:
 * always on, so it has no switch. Built in slices of at most 2 routes (docs/features/F37-ai-models-and-keys.md); each
 * route file is registered here with one line.
 */
export default defineModule({
  id: 'core.ai',
  kind: 'core',
  requires: ['core.auth'],
  jobs: [
    {
      // Runs by itself every night. It has no business of its own: it checks the platform's keys and models, then queues one check of
      // the own keys of each business.
      name: 'ai.check_health',
      schedule: CHECK_HEALTH_SCHEDULE,
      run: async (job) => {
        const health = createAiHealthService({ services: job.services });
        await health.checkPlatformKeys();
        await health.checkModels();
        await health.checkRetirements();
        for (const accountId of await job.listAccountIds()) {
          await job.enqueueJob('ai.check_business_keys', { accountId });
        }
      },
    },
    {
      // The check of one business's own keys, in that business's fence
      name: 'ai.check_business_keys',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        await createAiHealthService({ services: job.services }).checkBusinessKeys(job.accountContext.accountId);
      },
    },
    {
      // Every hour: has some job been falling back again and again?
      name: 'ai.check_fallbacks',
      schedule: CHECK_FALLBACKS_SCHEDULE,
      run: async (job) => {
        await createAiHealthService({ services: job.services }).checkFallbackStorms();
      },
    },
    {
      // Every night: deletes call records older than 90 days (the daily totals stay)
      name: 'ai.clean_old_calls',
      schedule: CLEAN_OLD_CALLS_SCHEDULE,
      run: async (job) => {
        await createAiHealthService({ services: job.services }).cleanOldCalls();
      },
    },
  ],
  routes: (app) => {
    aiModelsRoutes(app);
    aiKeysRoutes(app);
    aiSettingsRoutes(app);
    aiUsageRoutes(app);
    aiCallLogRoutes(app);
    platformAiModelsRoutes(app);
    platformAiAccessRoutes(app);
  },
});
