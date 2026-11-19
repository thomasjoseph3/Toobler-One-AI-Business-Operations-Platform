import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ApiError, notFound } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createAiService } from '../../../core/ai';
import { createAgentRuntime, createAgentSavedTurnService } from '../../../core/agents';
import { collectAgentTools } from '../../../../kernel/module-system/agent-tools';
import { isMetaSignatureValid, isVerifyTokenCorrect } from '../helpers/meta-signature';
import { parseMetaDelivery } from '../helpers/parse-meta-delivery';
import { createWindowLimiter } from '../helpers/window-limiter';
import { createWhatsappInboundService } from '../services/whatsapp-inbound.service';

/** What Meta sends to check the address: three fields with dots in their names. */
const verifyQuerySchema = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z
    .string()
    .regex(/^[\w-]{1,128}$/, 'Missing challenge')
    .optional(),
});

/**
 * Registers Meta's webhook at /webhooks/whatsapp (not under /api/v1: Meta calls it). GET is Meta checking the address with our verify token;
 * POST delivers customers' messages, each signed with the Meta app's secret. The signature is checked over the raw bytes, so this lives in
 * its own plugin that keeps the body as bytes. Meta is answered "received" at once and the AI answers afterwards, because Meta delivers a
 * message again when it waits too long.
 */
export function whatsappWebhookRoutes(app: FastifyInstance) {
  const { database, config, llm, registry, gate, whatsapp } = app.kernel;
  const runtime = createAgentRuntime({
    database,
    aiService: createAiService({ database, config, llm }),
    findExtraTools: (context) => collectAgentTools({ registry, gate, context }),
  });
  const inboundService = createWhatsappInboundService({
    database,
    config,
    gate,
    whatsapp,
    savedTurns: createAgentSavedTurnService({ database, runtime }),
    logger: app.log,
    customerLimiter: app.kernel.strictRouteLimits
      ? createWindowLimiter({ max: 15, windowMilliseconds: 60_000 })
      : undefined,
  });

  void app.register(async (scope) => {
    // The signature covers the exact bytes Meta sent, so the body is kept as bytes and read as JSON only after the signature is checked
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    const typedScope = scope.withTypeProvider<ZodTypeProvider>();

    typedScope.get(
      '/webhooks/whatsapp',
      {
        config: { access: 'public', ...routeLimit(app, 'whatsappVerify') },
        schema: { tags: ['channel.whatsapp'], querystring: verifyQuerySchema },
      },
      async (request, reply) => {
        const expectedToken = config.whatsapp.verifyToken;
        if (expectedToken === null) throw notFound('That page');
        const query = request.query;
        if (query['hub.mode'] !== 'subscribe' || !isVerifyTokenCorrect(query['hub.verify_token'], expectedToken)) {
          throw new ApiError(403, 'WRONG_VERIFY_TOKEN', 'Wrong verify token.');
        }
        if (query['hub.challenge'] === undefined) throw new ApiError(400, 'MISSING_CHALLENGE', 'Missing challenge.');
        return reply.type('text/plain').send(query['hub.challenge']);
      },
    );

    typedScope.post(
      '/webhooks/whatsapp',
      { config: { access: 'public', ...routeLimit(app, 'whatsappDelivery') }, schema: { tags: ['channel.whatsapp'] } },
      async (request, reply) => {
        const appSecret = config.whatsapp.appSecret;
        if (appSecret === null) throw notFound('That page');
        const rawBody = request.body;
        if (!Buffer.isBuffer(rawBody)) throw new ApiError(400, 'NOT_JSON', 'Send JSON.');
        const signature = request.headers['x-hub-signature-256'];
        if (!isMetaSignatureValid(rawBody, typeof signature === 'string' ? signature : undefined, appSecret)) {
          throw new ApiError(401, 'BAD_SIGNATURE', 'Bad signature.');
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody.toString('utf8'));
        } catch {
          throw new ApiError(400, 'NOT_JSON', 'Send JSON.');
        }
        const messages = parseMetaDelivery(parsed);
        // "Received" first; the AI's answer is written after this one
        await reply.code(200).send({ received: messages.length });
        for (const message of messages) void inboundService.answerMessage(message);
      },
    );
  });
}
