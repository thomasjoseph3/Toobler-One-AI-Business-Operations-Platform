import { defineModule } from '../../../kernel/module-system/define';
import { faqsRoutes } from './routes/faqs.routes';
import { knowledgeRoutes } from './routes/knowledge.routes';
import { settingsRoutes } from './routes/settings.routes';
import { unansweredQuestionsRoutes } from './routes/unanswered-questions.routes';
import { mergeSimilarQuestionsForBusiness } from './services/unanswered-questions.service';
import { searchRoutes } from './routes/search.routes';
import { situationsRoutes } from './routes/situations.routes';

/**
 * The business profile and situations: the fixed business questions, the answers to them, and how the business wants common
 * moments handled. A core module: always on, so it has no switch. Built in slices of at most 2 routes
 * (docs/features/F16-business-profile.md); each route file is registered here with one line.
 */
// When the nightly clean-up of unanswered questions runs: every day at 02:30 UTC (08:00 in India), a quiet time for most businesses
const MERGE_SIMILAR_QUESTIONS_SCHEDULE = '30 2 * * *';

export default defineModule({
  id: 'core.knowledge',
  kind: 'core',
  // The business's time zone and default country live on the business itself, which the sign-in module owns; "What do you sell?"
  // is answered by the offerings module's data
  requires: ['core.auth', 'core.offerings'],
  jobs: [
    {
      // Runs by itself every night. It has no business of its own, so it only queues one clean-up per business.
      name: 'knowledge.merge_similar_questions',
      schedule: MERGE_SIMILAR_QUESTIONS_SCHEDULE,
      run: async (job) => {
        for (const accountId of await job.listAccountIds()) {
          await job.enqueueJob('knowledge.merge_similar_questions_for_business', { accountId });
        }
      },
    },
    {
      // The clean-up of one business, in that business's fence
      name: 'knowledge.merge_similar_questions_for_business',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        await mergeSimilarQuestionsForBusiness(job.accountContext);
      },
    },
  ],
  routes: (app) => {
    knowledgeRoutes(app);
    situationsRoutes(app);
    settingsRoutes(app);
    faqsRoutes(app);
    unansweredQuestionsRoutes(app);
    searchRoutes(app);
  },
});
