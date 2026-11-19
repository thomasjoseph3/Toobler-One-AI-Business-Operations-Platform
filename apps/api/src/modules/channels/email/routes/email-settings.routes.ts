import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  emailCheckResultSchema,
  emailConnectionSchema,
  emailDraftIdParamsSchema,
  emailDraftSchema,
  emailDraftsResponseSchema,
  emailSettingsSchema,
  saveEmailConnectionRequestSchema,
  sendEmailDraftRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createEmailConnectionService } from '../services/email-connection.service';
import { createEmailDraftsService } from '../services/email-drafts.service';

/**
 * Registers /api/v1/channels/email: read the connection, connect or change it, check it, disconnect, and the replies waiting for approval
 * (list, send, discard). Managers only (the password and the replies are the business's own mail).
 */
export function emailSettingsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { database, config, mailbox } = app.kernel;
  const connectionService = createEmailConnectionService({ database, config, mailbox });
  const draftsService = createEmailDraftsService({ database, config, mailbox });

  typedApp.get(
    '/channels/email',
    { config: { access: 'manager' }, schema: { response: { 200: emailSettingsSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return connectionService.readSettings(request.principal);
    },
  );

  // The business comes from the session, never from the request. The password is never sent back.
  typedApp.put(
    '/channels/email',
    {
      config: { access: 'manager' },
      schema: { body: saveEmailConnectionRequestSchema, response: { 200: emailConnectionSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return connectionService.saveConnection(request.principal, request.body);
    },
  );

  // Signs in to the mailbox (reads nothing), so it is limited to 10 a minute from one address.
  typedApp.post(
    '/channels/email/check',
    {
      config: { access: 'manager', ...routeLimit(app, 'emailCheck') },
      schema: { response: { 200: emailCheckResultSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return connectionService.checkConnection(request.principal);
    },
  );

  typedApp.delete('/channels/email', { config: { access: 'manager' } }, async (request, reply) => {
    if (!request.principal) throw unauthorized();
    await connectionService.disconnect(request.principal);
    return reply.code(204).send();
  });

  typedApp.get(
    '/channels/email/drafts',
    { config: { access: 'manager' }, schema: { response: { 200: emailDraftsResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return draftsService.listWaitingDrafts(request.principal);
    },
  );

  // Sends a real email from the business's mailbox, so it is limited like the check.
  typedApp.post(
    '/channels/email/drafts/:id/send',
    {
      config: { access: 'manager', ...routeLimit(app, 'emailCheck') },
      schema: {
        params: emailDraftIdParamsSchema,
        body: sendEmailDraftRequestSchema,
        response: { 200: emailDraftSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized();
      return draftsService.sendDraft(request.principal, request.params.id, request.body.body);
    },
  );

  typedApp.delete(
    '/channels/email/drafts/:id',
    { config: { access: 'manager' }, schema: { params: emailDraftIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized();
      await draftsService.discardDraft(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
