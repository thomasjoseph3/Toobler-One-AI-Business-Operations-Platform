import { defineModule } from '../../../kernel/module-system/define';
import { whatsappSettingsRoutes } from './routes/whatsapp-settings.routes';
import { whatsappWebhookRoutes } from './routes/whatsapp-webhook.routes';
import { createIdleConversationsService } from './services/idle-conversations.service';
import { sendStaffReplyOnWhatsapp } from './services/whatsapp-staff-reply.service';

/**
 * WhatsApp: customers write to the business's WhatsApp number and the AI agent answers (docs/features/F25-whatsapp.md). A channel module:
 * the business switches it on and off in Settings → Modules, and while it is off its routes answer 404 and its data is kept. It only
 * translates between Meta and the conversation engine: the agent, the sorting and the summary are the core modules' (it has no logic of its
 * own about what to answer).
 */
export default defineModule({
  id: 'channel.whatsapp',
  kind: 'channel',
  // The conversation is saved and answered through these, and the access token is scrambled by the AI module's helper
  requires: ['core.auth', 'core.conversations', 'core.agents', 'core.ai'],
  events: {
    // A team member's reply written in the inbox goes out to the customer on WhatsApp
    'conversation.message': async (event, accountContext, services) => {
      if (event.payload['sender'] !== 'staff') return;
      const conversationId = event.payload['conversationId'];
      const messageId = event.payload['messageId'];
      if (typeof conversationId !== 'string' || typeof messageId !== 'string') return;
      await sendStaffReplyOnWhatsapp({
        database: services.database,
        config: services.config,
        whatsapp: services.whatsapp,
        accountContext,
        conversationId,
        messageId,
      });
    },
  },
  jobs: [
    {
      // Runs by itself every ten minutes. It has no business of its own: it finds the businesses with WhatsApp conversations gone quiet
      // and queues one job for each, so one business never holds up another.
      name: 'whatsapp.find_idle_conversations',
      schedule: '*/10 * * * *',
      run: async (job) => {
        const idleConversations = createIdleConversationsService({
          database: job.services.database,
          enqueueJob: job.enqueueJob,
        });
        for (const accountId of await idleConversations.findBusinessesWithIdleConversations()) {
          await job.enqueueJob('whatsapp.end_idle_conversations', { accountId });
        }
      },
    },
    {
      // Ends one business's idle WhatsApp conversations and queues the sorting and the summary of each. Skipped while the business has
      // WhatsApp switched off (the job runner checks the module), and safe to run twice.
      name: 'whatsapp.end_idle_conversations',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const idleConversations = createIdleConversationsService({
          database: job.services.database,
          enqueueJob: job.enqueueJob,
        });
        await idleConversations.endIdleConversationsOfBusiness(job.accountContext.accountId);
      },
    },
  ],
  // Meta's webhook is called by Meta's servers, so it lives outside /api/v1
  pages: (app) => {
    whatsappWebhookRoutes(app);
  },
  routes: (app) => {
    whatsappSettingsRoutes(app);
  },
});
