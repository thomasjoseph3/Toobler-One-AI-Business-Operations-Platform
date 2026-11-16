import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  widgetChatSchema,
  widgetConfigSchema,
  widgetEndResponseSchema,
  widgetKeyParamsSchema,
  widgetMessageRequestSchema,
  widgetMessageResponseSchema,
} from '@toobler-one/shared';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createAiService } from '../../../core/ai';
import { createAgentRuntime, createAgentSavedTurnService } from '../../../core/agents';
import { collectAgentTools } from '../../../../kernel/module-system/agent-tools';
import { createWindowLimiter } from '../helpers/window-limiter';
import { createWidgetChatService } from '../services/widget-chat.service';

/** Lets the browser read the answer when the call came from an allowed website (the website was checked before this is called). */
function allowTheWebsiteToReadTheAnswer(reply: FastifyReply, origin: string | null): void {
  // A call from the chat window itself is on the same address, so it needs no permission
  if (origin === null) return;
  reply.header('access-control-allow-origin', origin);
  reply.header('vary', 'Origin');
}

/** Reads the visitor token from `Authorization: Bearer <token>`, or undefined when the header is missing or is not that form. */
function readBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer (\S+)$/.exec(header);
  return match ? match[1] : undefined;
}

/**
 * Registers the public chat routes a visitor's browser calls from the business's own website: /api/v1/public/widget/{key}/config (how the
 * bubble looks) and /messages (chat with the agent), each with the browser's permission check (OPTIONS). No sign-in: the widget key finds
 * the business, the website must be on its allowed list, and a chat is carried on with a signed visitor token.
 */
export function widgetPublicRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { database, config, llm, registry, gate } = app.kernel;
  const runtime = createAgentRuntime({
    database,
    aiService: createAiService({ database, config, llm }),
    findExtraTools: (context) => collectAgentTools({ registry, gate, context }),
  });
  const widgetChatService = createWidgetChatService({
    database,
    gate,
    publicBaseUrl: config.publicBaseUrl,
    appSecret: config.auth.jwtSecret,
    savedTurns: createAgentSavedTurnService({ database, runtime }),
    // Looked up when a chat ends, so the runner that server.ts starts later is the one used
    enqueueJob: (jobName, data) => app.kernel.enqueueJob(jobName, data),
    // Tests that switch the route limits off switch these off too
    limiters: app.kernel.strictRouteLimits
      ? {
          messagesPerKey: createWindowLimiter({ max: 120, windowMilliseconds: 60_000 }),
          newChatsPerAddress: createWindowLimiter({ max: 10, windowMilliseconds: 3_600_000 }),
        }
      : undefined,
  });

  /** The browser's permission check: allowed (with the website named) only for a website on the business's list; otherwise no permission is given. */
  const answerPermissionCheck = async (
    widgetKey: string,
    origin: string | undefined,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      await widgetChatService.openWidget(widgetKey, origin);
    } catch {
      // Unknown key, chat switched off, or website not allowed: the same empty answer with no permission, so nothing is revealed
      reply.code(204).send();
      return;
    }
    reply.header('access-control-allow-origin', origin as string);
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    reply.header('access-control-allow-headers', 'content-type, authorization');
    reply.header('access-control-max-age', '600');
    reply.code(204).send();
  };

  typedApp.options(
    '/public/widget/:key/config',
    { config: { access: 'public', ...routeLimit(app, 'widgetConfig') }, schema: { params: widgetKeyParamsSchema } },
    async (request, reply) => answerPermissionCheck(request.params.key, request.headers.origin, reply),
  );
  typedApp.options(
    '/public/widget/:key/messages',
    { config: { access: 'public', ...routeLimit(app, 'widgetConfig') }, schema: { params: widgetKeyParamsSchema } },
    async (request, reply) => answerPermissionCheck(request.params.key, request.headers.origin, reply),
  );

  typedApp.options(
    '/public/widget/:key/end',
    { config: { access: 'public', ...routeLimit(app, 'widgetConfig') }, schema: { params: widgetKeyParamsSchema } },
    async (request, reply) => answerPermissionCheck(request.params.key, request.headers.origin, reply),
  );

  // Public. How the bubble should look and which buttons it shows. The business comes only from the key; 404 for an unknown key or a
  // switched-off chat; 403 for a website that is not on the business's list.
  typedApp.get(
    '/public/widget/:key/config',
    {
      config: { access: 'public', ...routeLimit(app, 'widgetConfig') },
      schema: { params: widgetKeyParamsSchema, response: { 200: widgetConfigSchema } },
    },
    async (request, reply) => {
      const widget = await widgetChatService.openWidget(
        request.params.key,
        request.headers.origin,
        request.headers['sec-fetch-site'] === 'same-origin',
      );
      allowTheWebsiteToReadTheAnswer(reply, widget.origin);
      return widgetChatService.readConfig(widget);
    },
  );

  // Public. A visitor's message, answered by the agent. Without `Authorization: Bearer <token>` it starts a chat; with the token it
  // carries it on. Every message makes real AI calls, so it is limited.
  typedApp.post(
    '/public/widget/:key/messages',
    {
      config: { access: 'public', ...routeLimit(app, 'widgetMessage') },
      schema: {
        params: widgetKeyParamsSchema,
        body: widgetMessageRequestSchema,
        response: { 200: widgetMessageResponseSchema },
      },
    },
    async (request, reply) => {
      const widget = await widgetChatService.openWidget(
        request.params.key,
        request.headers.origin,
        request.headers['sec-fetch-site'] === 'same-origin',
      );
      allowTheWebsiteToReadTheAnswer(reply, widget.origin);
      return widgetChatService.sendMessage({
        widget,
        visitorToken: readBearerToken(request.headers.authorization),
        message: request.body.message,
        address: request.ip,
      });
    },
  );

  // Public. The chat so far, for a visitor whose page was reloaded. Needs the visitor token (401 without a good one). Changes nothing.
  typedApp.get(
    '/public/widget/:key/messages',
    {
      config: { access: 'public', ...routeLimit(app, 'widgetConfig') },
      schema: { params: widgetKeyParamsSchema, response: { 200: widgetChatSchema } },
    },
    async (request, reply) => {
      const widget = await widgetChatService.openWidget(
        request.params.key,
        request.headers.origin,
        request.headers['sec-fetch-site'] === 'same-origin',
      );
      allowTheWebsiteToReadTheAnswer(reply, widget.origin);
      return widgetChatService.readChat({ widget, visitorToken: readBearerToken(request.headers.authorization) });
    },
  );

  // Public. The visitor closes the bubble: the chat ends and is sorted and summarised. Needs the visitor token. Closing twice is harmless.
  typedApp.post(
    '/public/widget/:key/end',
    {
      config: { access: 'public', ...routeLimit(app, 'widgetEnd') },
      schema: { params: widgetKeyParamsSchema, response: { 200: widgetEndResponseSchema } },
    },
    async (request, reply) => {
      const widget = await widgetChatService.openWidget(
        request.params.key,
        request.headers.origin,
        request.headers['sec-fetch-site'] === 'same-origin',
      );
      allowTheWebsiteToReadTheAnswer(reply, widget.origin);
      await widgetChatService.endChat({ widget, visitorToken: readBearerToken(request.headers.authorization) });
      return { ended: true as const };
    },
  );
}
