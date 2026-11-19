import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  saveWhatsappConnectionRequestSchema,
  whatsappCheckResultSchema,
  whatsappConnectionSchema,
  whatsappSettingsSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createWhatsappConnectionService } from '../services/whatsapp-connection.service';

/** Registers /api/v1/channels/whatsapp: read the connection, connect or change it, check it with Meta, disconnect. Managers only. */
export function whatsappSettingsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { database, config, whatsapp } = app.kernel;
  const connectionService = createWhatsappConnectionService({ database, config, whatsapp });

  // Managers only (it shows the verify token). Answers 404 while the WhatsApp channel is switched off for the business.
  typedApp.get(
    '/channels/whatsapp',
    { config: { access: 'manager' }, schema: { response: { 200: whatsappSettingsSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return connectionService.readSettings(request.principal);
    },
  );

  // Managers only. The business comes from the session, never from the request. The token is never sent back.
  typedApp.put(
    '/channels/whatsapp',
    {
      config: { access: 'manager' },
      schema: { body: saveWhatsappConnectionRequestSchema, response: { 200: whatsappConnectionSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return connectionService.saveConnection(request.principal, request.body);
    },
  );

  // Managers only. Makes one real call to Meta (it sends nothing to anyone), so it is limited to 10 a minute from one address.
  typedApp.post(
    '/channels/whatsapp/check',
    {
      config: { access: 'manager', ...routeLimit(app, 'whatsappCheck') },
      schema: { response: { 200: whatsappCheckResultSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return connectionService.checkConnection(request.principal);
    },
  );

  // Managers only. Removes the connection and the saved token; conversations stay.
  typedApp.delete('/channels/whatsapp', { config: { access: 'manager' } }, async (request, reply) => {
    if (!request.principal) throw unauthorized();
    await connectionService.disconnect(request.principal);
    return reply.code(204).send();
  });
}
