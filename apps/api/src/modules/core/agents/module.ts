import { defineModule } from '../../../kernel/module-system/define';
import { createAiService } from '../ai';
import { agentTestChatRoutes } from './routes/agent-test-chat.routes';
import { handleOutcomesApplied } from './services/agent-facts-applier.service';
import { createConversationSummaryService } from './services/conversation-summary.service';

/**
 * The AI agent that talks to customers in text (F19): its prompt, its tools, the promise it ends with, and the checks on what it says.
 * A core module: always on, so it has no switch. The channels (web chat, WhatsApp, email) call it through `index.ts`; it never calls a
 * channel. Built in slices (docs/features/F19-ai-agent-and-test-the-agent.md); each route file is registered here with one line.
 */
export default defineModule({
  id: 'core.agents',
  kind: 'core',
  // It reads the business (auth), what the business told it (knowledge), what it sells (offerings), writes down conversations
  // (conversations) and asks the AI for replies (ai); the company a customer names is saved through contacts and companies
  requires: [
    'core.auth',
    'core.knowledge',
    'core.offerings',
    'core.conversations',
    'core.ai',
    'core.contacts',
    'core.companies',
  ],
  // When a conversation's contact and lead are made, what the AI learned is added to them (so far: the company the customer named)
  events: { 'conversation.outcomes_applied': handleOutcomesApplied },
  jobs: [
    {
      // Writes the short summary of one conversation. A channel queues it with the business and the conversation when the conversation
      // ends. Safe to run twice (it writes the summary again), and if the AI cannot answer it fails so it is tried again.
      name: 'agents.summarise_conversation',
      run: async (job) => {
        if (!job.accountContext) throw new Error('This job needs a business');
        const { conversationId } = job.data;
        if (typeof conversationId !== 'string') throw new Error('This job needs a conversationId');
        const summaries = createConversationSummaryService({
          database: job.services.database,
          aiService: createAiService({
            database: job.services.database,
            config: job.services.config,
            llm: job.services.llm,
          }),
        });
        await summaries.summariseConversation(job.accountContext.accountId, conversationId);
      },
    },
  ],
  routes: (app) => {
    agentTestChatRoutes(app);
  },
});
