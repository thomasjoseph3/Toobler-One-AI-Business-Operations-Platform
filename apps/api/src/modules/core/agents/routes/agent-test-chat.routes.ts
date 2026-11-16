import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { agentTestChatRequestSchema, agentTestChatResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { collectAgentTools } from '../../../../kernel/module-system/agent-tools';
import { createAiService } from '../../ai';
import { createAgentRuntime } from '../services/agent-runtime.service';
import { createAgentTestChatService } from '../services/agent-test-chat.service';

/** Registers /api/v1/agent/test-chat (a staff member chats as a pretend customer with the AI agent). */
export function agentTestChatRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { database, config, llm, registry, gate } = app.kernel;
  const runtime = createAgentRuntime({
    database,
    aiService: createAiService({ database, config, llm }),
    // The tools other modules add (WhatsApp's "send details" and so on), only for modules that are on for this business
    findExtraTools: (context) => collectAgentTools({ registry, gate, context }),
  });
  const testChatService = createAgentTestChatService({ database, runtime });

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
}
