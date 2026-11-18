import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  acceptInvitationRequestSchema,
  invitationPreviewSchema,
  okResponseSchema,
  previewInvitationRequestSchema,
} from '@toobler-one/shared';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createInvitationAcceptService } from '../services/invitation-accept.service';

/** Registers POST /api/v1/auth/invitations/preview (who invited me?) and POST /api/v1/auth/accept-invitation (choose a password and join). */
export function invitationAcceptRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const invitationAcceptService = createInvitationAcceptService({ database: app.kernel.database });

  // Open to anyone (the person has no account yet), so it is listed in kernel/http/public-routes.ts. A POST so the token is in the body, not in a logged address.
  typedApp.post(
    '/auth/invitations/preview',
    {
      config: { access: 'public', ...routeLimit(app, 'acceptInvitation') },
      schema: { body: previewInvitationRequestSchema, response: { 200: invitationPreviewSchema } },
    },
    async (request) => invitationAcceptService.previewInvitation(request.body.token),
  );

  // Open to anyone: the token from the emailed link is the proof. Listed in kernel/http/public-routes.ts.
  typedApp.post(
    '/auth/accept-invitation',
    {
      config: { access: 'public', ...routeLimit(app, 'acceptInvitation') },
      schema: { body: acceptInvitationRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await invitationAcceptService.acceptInvitation(request.body);
      return { ok: true as const };
    },
  );
}
