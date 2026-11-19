import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { aiSettingsSchema, updateAiSettingsRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createAiSettingsService } from '../services/ai-settings.service';

/** Registers GET and PUT /api/v1/ai/settings. */
export function aiSettingsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const aiSettingsService = createAiSettingsService({ database: app.kernel.database });

  // For managers only. The business comes from the session. Shows the key mode, the business's own model order for jobs, and
  // (read-only) what the platform has allowed it.
  typedApp.get(
    '/ai/settings',
    { config: { access: 'manager' }, schema: { response: { 200: aiSettingsSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return aiSettingsService.getSettings(request.principal);
    },
  );

  // For managers only. Only the fields sent change. The platform's part cannot be set here (the body refuses unknown fields).
  typedApp.put(
    '/ai/settings',
    {
      config: { access: 'manager' },
      schema: { body: updateAiSettingsRequestSchema, response: { 200: aiSettingsSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return aiSettingsService.updateSettings(request.principal, request.body);
    },
  );
}
