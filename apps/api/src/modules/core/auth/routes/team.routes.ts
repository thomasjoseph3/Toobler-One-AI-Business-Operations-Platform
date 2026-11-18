import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  inviteMemberRequestSchema,
  invitationCreatedSchema,
  invitationIdParamsSchema,
  removeTeamMemberQuerySchema,
  teamMemberIdParamsSchema,
  teamMemberSchema,
  teamResponseSchema,
  updateTeamMemberRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { createTeamService } from '../services/team.service';

/** Registers GET /api/v1/team (the people and waiting invitations) and POST /api/v1/team/invitations (invite a person). */
export function teamRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, mail } = app.kernel;
  const teamService = createTeamService({ config, database, mail, logger: app.log });

  // Managers only (the Team screen shows emails and phone numbers). A plain read.
  typedApp.get(
    '/team',
    { config: { access: 'manager' }, schema: { response: { 200: teamResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return teamService.listTeam(request.principal);
    },
  );

  // Managers only. The business comes from the session, never from the request. Sends an email, so it is limited per address.
  typedApp.post(
    '/team/invitations',
    {
      config: { access: 'manager' },
      schema: { body: inviteMemberRequestSchema, response: { 201: invitationCreatedSchema } },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const created = await teamService.inviteMember(request.principal, request.body);
      return reply.code(201).send(created);
    },
  );

  // Managers only: change a person's role, or add a removed person back. The business always keeps one manager (409 otherwise).
  typedApp.patch(
    '/team/members/:id',
    {
      config: { access: 'manager' },
      schema: {
        params: teamMemberIdParamsSchema,
        body: updateTeamMemberRequestSchema,
        response: { 200: teamMemberSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return teamService.updateMember(request.principal, request.params.id, request.body);
    },
  );

  // Managers only: remove a person (they can no longer sign in; their open leads, tasks and tickets go to `hand_over_to`, or to the manager removing them).
  typedApp.delete(
    '/team/members/:id',
    {
      config: { access: 'manager' },
      schema: { params: teamMemberIdParamsSchema, querystring: removeTeamMemberQuerySchema },
    },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await teamService.removeMember(request.principal, request.params.id, request.query.hand_over_to);
      return reply.code(204).send();
    },
  );

  // Managers only: cancel an invitation nobody has accepted yet.
  typedApp.delete(
    '/team/invitations/:id',
    { config: { access: 'manager' }, schema: { params: invitationIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await teamService.cancelInvitation(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );

  // Managers only: send an invitation again with a new link (the old one stops working). Sends an email, so it is limited per address.
  typedApp.post(
    '/team/invitations/:id/resend',
    {
      config: { access: 'manager', ...routeLimit(app, 'resendInvitation') },
      schema: { params: invitationIdParamsSchema, response: { 200: invitationCreatedSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return teamService.resendInvitation(request.principal, request.params.id);
    },
  );
}
