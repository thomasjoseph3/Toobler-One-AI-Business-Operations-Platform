import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { patchWebchatSettingsRequestSchema, webchatSettingsSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createWebchatSettingsService } from '../services/webchat-settings.service';

/** Registers /api/v1/channels/webchat (read the settings and the code to paste, change the settings). */
export function webchatSettingsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const settingsService = createWebchatSettingsService({
    database: app.kernel.database,
    publicBaseUrl: app.kernel.config.publicBaseUrl,
  });

  // For every signed-in role. The first read makes the business's settings (with a new key and no allowed website). Answers 404 while
  // the website chat is switched off for the business (the module guard), and its data is kept.
  typedApp.get(
    '/channels/webchat',
    { config: { access: 'staff' }, schema: { response: { 200: webchatSettingsSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return settingsService.readSettings(request.principal);
    },
  );

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request.
  typedApp.patch(
    '/channels/webchat',
    {
      config: { access: 'manager' },
      schema: { body: patchWebchatSettingsRequestSchema, response: { 200: webchatSettingsSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return settingsService.changeSettings(request.principal, request.body);
    },
  );
}
