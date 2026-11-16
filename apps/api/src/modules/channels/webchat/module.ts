import { defineModule } from '../../../kernel/module-system/define';
import { webchatSettingsRoutes } from './routes/webchat-settings.routes';
import { createIdleChatsService } from './services/idle-chats.service';
import { widgetFilesRoutes } from './routes/widget-files.routes';
import { widgetPublicRoutes } from './routes/widget-public.routes';

/**
 * The website chat: a chat bubble on the business's own website where the AI agent answers visitors (docs/features/F20-website-chat.md).
 * A channel module: the business switches it on and off in Settings → Modules, and while it is off its routes answer 404 and its data is
 * kept. Built in slices of at most 2 routes; each route file is registered here with one line. It only translates between a visitor's
 * browser and the conversation engine: the agent, the sorting and the summary are the core modules' (it never has logic of its own about
 * what to answer).
 */
export default defineModule({
  id: 'channel.webchat',
  kind: 'channel',
  // The chat is saved as conversations, answered by the agent, and the agent reads the business through these
  requires: ['core.auth', 'core.conversations', 'core.agents', 'core.ai'],
  jobs: [
    {
      // Runs by itself every minute. It has no business of its own: it finds the businesses that have web chats gone quiet for 15 minutes
      // and queues one job for each, so one business never holds up another.
      name: 'webchat.find_idle_chats',
      schedule: '* * * * *',
      run: async (job) => {
        const idleChats = createIdleChatsService({ database: job.services.database, enqueueJob: job.enqueueJob });
        for (const accountId of await idleChats.findBusinessesWithIdleChats()) {
          await job.enqueueJob('webchat.end_idle_chats', { accountId });
        }
      },
    },
    {
      // Ends one business's idle web chats and queues the sorting and the summary of each. Skipped while the business has the chat switched
      // off (the job runner checks the module), and safe to run twice.
      name: 'webchat.end_idle_chats',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const idleChats = createIdleChatsService({ database: job.services.database, enqueueJob: job.enqueueJob });
        await idleChats.endIdleChatsOfBusiness(job.accountContext.accountId);
      },
    },
  ],
  // The loader, the chat window and (in development) a test page: served from the API's own address, outside /api/v1
  pages: (app) => {
    widgetFilesRoutes(app);
  },
  routes: (app) => {
    webchatSettingsRoutes(app);
    widgetPublicRoutes(app);
  },
});
