import { defineModule } from '../../../kernel/module-system/define';
import { createGooglePlacesProvider } from '../../../providers/places';
import { createAiService } from '../ai';
import { prefillRoutes } from './routes/prefill.routes';
import { setupRoutes } from './routes/setup.routes';
import { createWebsiteAnswerExtractor } from './services/extract-website-answers.service';
import { createWebPageFetcher } from './services/fetch-web-page.service';
import { createWebsiteReader } from './services/read-website.service';
import { createRunPrefillService } from './services/run-prefill.service';

/**
 * The setup wizard (F31): the owner's guided setup after sign-up. A core module: always on. Built in slices of at most 2
 * routes (docs/features/F31-setup-wizard.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.setup',
  kind: 'core',
  // It reads which business questions are answered (knowledge), reads and changes the business's own details (auth), asks the AI to
  // read a website (ai), gives the leads board its industry's words (leads) and checks the agent has been tried (conversations)
  requires: ['core.auth', 'core.knowledge', 'core.ai', 'core.leads', 'core.conversations'],
  jobs: [
    {
      // Reads one business's website and/or Google listing and saves what it finds as answers waiting for a check. The prefill
      // route queues it with the business and the run. Safe to run twice (a finished run is left alone).
      name: 'setup.run_prefill',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const { runId } = job.data;
        if (typeof runId !== 'string') throw new Error('This job needs a runId');
        const googleKey = job.services.config.googlePlaces.apiKey;
        await createRunPrefillService({
          database: job.services.database,
          websiteReader: createWebsiteReader({ fetchWebPage: createWebPageFetcher() }),
          answerExtractor: createWebsiteAnswerExtractor({
            aiService: createAiService({
              database: job.services.database,
              config: job.services.config,
              llm: job.services.llm,
            }),
          }),
          placesProvider: googleKey ? createGooglePlacesProvider({ apiKey: googleKey }) : null,
          logger: job.logger,
        }).runPrefill(job.accountContext.accountId, runId);
      },
    },
  ],
  routes: (app) => {
    setupRoutes(app);
    prefillRoutes(app);
  },
});
