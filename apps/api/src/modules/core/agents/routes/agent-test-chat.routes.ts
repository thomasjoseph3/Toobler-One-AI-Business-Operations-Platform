import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  agentTestChatDetailSchema,
  agentTestChatParamsSchema,
  agentTestChatRequestSchema,
  agentTestChatResponseSchema,
  agentTestChatSummarySchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { collectAgentTools } from '../../../../kernel/module-system/agent-tools';
import { createAiService } from '../../ai';
import { createAgentRuntime } from '../services/agent-runtime.service';
import { createAgentTestChatService } from '../services/agent-test-chat.service';
import { createConversationSummaryService } from '../services/conversation-summary.service';

/**
 * Registers /api/v1/agent/test-chat (a staff member chats as a pretend customer with the AI agent), /agent/test-chats/{id} (read a saved
 * test chat back) and /agent/test-chats/{id}/summary (write its summary, as it would be written when a real conversation ends).
 */
export function agentTestChatRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { database, config, llm, registry, gate } = app.kernel;
  const runtime = createAgentRuntime({
    database,
    aiService: createAiService({ database, config, llm }),
    // The tools other modules add (WhatsApp's "send details" and so on), only for modules that are on for this business
    findExtraTools: (context) => collectAgentTools({ registry, gate, context }),
  });
  const summaries = createConversationSummaryService({
    database,
    aiService: createAiService({ database, config, llm }),
  });
  const testChatService = createAgentTestChatService({ database, runtime, summaries });

  // For managers and staff (the "own leads only" role answers 403). Every message makes a real call to an AI company, so it is limited.
  // Another business's chat, an unknown id, and a real customer's conversation all answer 404. Never creates a lead, a ticket or a contact.
  typedApp.post(
    '/agent/test-chat',
    {
      config: { access: 'staff', ...routeLimit(app, 'testAgentChat') },
      schema: { body: agentTestChatRequestSchema, response: { 200: agentTestChatResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return testChatService.sendTestMessage(request.principal, request.body);
    },
  );

  // For managers and staff. Reads a saved test chat: its messages, what the agent learned, the promise and the summary. Another business's
  // chat, an unknown id and a real customer's conversation all answer 404.
  typedApp.get(
    '/agent/test-chats/:conversationId',
    {
      config: { access: 'staff' },
      schema: { params: agentTestChatParamsSchema, response: { 200: agentTestChatDetailSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return testChatService.readTestChat(request.principal, request.params.conversationId);
    },
  );

  // For managers and staff. Asks the AI to summarise the test chat and saves the summary with the chat. A real AI call, so it is limited too.
  typedApp.post(
    '/agent/test-chats/:conversationId/summary',
    {
      config: { access: 'staff', ...routeLimit(app, 'testAgentChat') },
      schema: { params: agentTestChatParamsSchema, response: { 200: agentTestChatSummarySchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return testChatService.summariseTestChat(request.principal, request.params.conversationId);
    },
  );
}
