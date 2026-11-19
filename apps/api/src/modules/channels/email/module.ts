import { defineModule } from '../../../kernel/module-system/define';
import { collectAgentTools } from '../../../kernel/module-system/agent-tools';
import { createAgentRuntime, createAgentSavedTurnService } from '../../core/agents';
import { createConversationClassifier, createEnquiryGate } from '../../core/conversations';
import { createAiService } from '../../core/ai';
import { emailSettingsRoutes } from './routes/email-settings.routes';
import * as emailConnectionRepository from './repositories/email-connection.repository';
import { createEmailReaderService } from './services/email-reader.service';
import { createIdleEmailConversationsService } from './services/idle-email-conversations.service';
import { sendStaffReplyByEmail } from './services/email-staff-reply.service';

/**
 * Email: the business connects its enquiry mailbox; the AI reads new customer emails, answers or drafts a reply, and the enquiry becomes a
 * lead (docs/features/F26-email.md). A channel module: the business switches it on and off in Settings → Modules, and while it is off its
 * routes and jobs stop and its data is kept. It only translates between the mailbox and the conversation engine: the agent, the sorting and
 * the summary are the core modules'.
 */
export default defineModule({
  id: 'channel.email',
  kind: 'channel',
  requires: ['core.auth', 'core.conversations', 'core.agents', 'core.ai'],
  events: {
    // A team member's reply written in the inbox goes out to the customer by email, in their thread
    'conversation.message': async (event, accountContext, services) => {
      if (event.payload['sender'] !== 'staff') return;
      const conversationId = event.payload['conversationId'];
      const messageId = event.payload['messageId'];
      if (typeof conversationId !== 'string' || typeof messageId !== 'string') return;
      await sendStaffReplyByEmail({
        database: services.database,
        config: services.config,
        mailbox: services.mailbox,
        accountId: accountContext.accountId,
        conversationId,
        messageId,
      });
    },
  },
  jobs: [
    {
      // Runs by itself every two minutes. It has no business of its own: it finds the businesses whose mailbox should be read and queues one
      // job for each, so one slow mailbox never holds up another.
      name: 'email.find_mailboxes',
      schedule: '*/2 * * * *',
      run: async (job) => {
        for (const accountId of await emailConnectionRepository.listAccountIdsToRead(job.services.database.system)) {
          await job.enqueueJob('email.read_mailbox', { accountId });
        }
      },
    },
    {
      // Reads one business's mailbox once and answers or drafts for each new customer email. Skipped while the business has Email switched
      // off (the job runner checks the module), and safe to run twice (an email already seen is skipped).
      name: 'email.read_mailbox',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const { registry, gate, services } = job;
        if (!registry || !gate || !services.mailbox) throw new Error('The email job needs the modules and the mailbox');
        const aiService = createAiService({ database: services.database, config: services.config, llm: services.llm });
        const runtime = createAgentRuntime({
          database: services.database,
          aiService,
          findExtraTools: (context) => collectAgentTools({ registry, gate, context }),
        });
        const reader = createEmailReaderService({
          database: services.database,
          config: services.config,
          mailbox: services.mailbox,
          savedTurns: createAgentSavedTurnService({ database: services.database, runtime }),
          enquiryGate: createEnquiryGate({
            database: services.database,
            classifier: createConversationClassifier({ aiService }),
          }),
          logger: job.logger,
        });
        await reader.readMailboxOfBusiness(job.accountContext.accountId);
      },
    },
    {
      // Runs by itself every ten minutes: finds the businesses with email conversations gone quiet.
      name: 'email.find_idle_conversations',
      schedule: '*/10 * * * *',
      run: async (job) => {
        const idle = createIdleEmailConversationsService({
          database: job.services.database,
          enqueueJob: job.enqueueJob,
          idleMinutes: job.services.config.channelIdleMinutes.email,
        });
        for (const accountId of await idle.findBusinessesWithIdleConversations()) {
          await job.enqueueJob('email.end_idle_conversations', { accountId });
        }
      },
    },
    {
      // Ends one business's idle email conversations and queues the sorting and the summary of each. Safe to run twice.
      name: 'email.end_idle_conversations',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const idle = createIdleEmailConversationsService({
          database: job.services.database,
          enqueueJob: job.enqueueJob,
          idleMinutes: job.services.config.channelIdleMinutes.email,
        });
        await idle.endIdleConversationsOfBusiness(job.accountContext.accountId);
      },
    },
  ],
  routes: (app) => {
    emailSettingsRoutes(app);
  },
});
