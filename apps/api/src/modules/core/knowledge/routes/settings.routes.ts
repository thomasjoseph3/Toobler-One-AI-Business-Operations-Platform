import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { businessSettingsSchema, putBusinessSettingsRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createBusinessSettingsService } from '../../auth';

/** Registers /api/v1/knowledge/settings (read, change): the business's time zone and default country. */
export function settingsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const businessSettingsService = createBusinessSettingsService({ database: app.kernel.database });

  // For any signed-in, verified person. The two values come with the signed-in person's details, read fresh on every request.
  typedApp.get(
    '/knowledge/settings',
    { config: { access: 'staff' }, schema: { response: { 200: businessSettingsSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return { timeZone: request.principal.timeZone, defaultCountry: request.principal.defaultCountry };
    },
  );

  // For managers only (the guard answers 403 to staff). The business comes from the session, never from the request.
  typedApp.put(
    '/knowledge/settings',
    {
      config: { access: 'manager' },
      schema: { body: putBusinessSettingsRequestSchema, response: { 200: businessSettingsSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return businessSettingsService.changeBusinessSettings(request.principal, request.body);
    },
  );
}
