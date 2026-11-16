import { defineModule } from '../../../kernel/module-system/define';
import { createAiService } from '../ai';
import { createConversationClassifier } from './services/conversation-classifier.service';
import { createConversationFinaliser } from './services/conversation-finaliser.service';
import { blockListRoutes } from './routes/block-list.routes';
import { conversationTypesRoutes } from './routes/conversation-types.routes';
import { conversationsRoutes } from './routes/conversations.routes';

/**
 * Conversations: how every conversation, on any channel, is sorted into a type and what happens next (a lead, a ticket, a log
 * line, the Filtered tab). A core module: always on, so it has no switch. Built in slices of at most 2 routes
 * (docs/features/F15-conversation-types-and-router.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.conversations',
  kind: 'core',
  // The router raises leads and tickets for contacts, and sorting is done by the AI service
  requires: ['core.auth', 'core.contacts', 'core.leads', 'core.tickets', 'core.ai'],
  jobs: [
    {
      // Sorts one conversation after it has ended. A channel queues it with the business and the conversation (and, for a call or an
      // email, the facts only the channel knows). It is safe to run twice, and if the AI cannot answer it fails so it is tried again.
      name: 'conversations.sort_conversation',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const { conversationId, callDurationSeconds, callerSpoke, emailHeaders } = job.data;
        if (typeof conversationId !== 'string') throw new Error('This job needs a conversationId');
        const aiService = createAiService({
          database: job.services.database,
          config: job.services.config,
          llm: job.services.llm,
        });
        const finaliser = createConversationFinaliser({
          database: job.services.database,
          classifier: createConversationClassifier({ aiService }),
        });
        await finaliser.finaliseConversation(job.accountContext.accountId, conversationId, {
          ...(typeof callDurationSeconds === 'number' ? { callDurationSeconds } : {}),
          ...(typeof callerSpoke === 'boolean' ? { callerSpoke } : {}),
          ...(emailHeaders !== null && typeof emailHeaders === 'object'
            ? { emailHeaders: emailHeaders as Record<string, string> }
            : {}),
        });
      },
    },
  ],
  routes: (app) => {
    conversationTypesRoutes(app);
    blockListRoutes(app);
    conversationsRoutes(app);
  },
});
