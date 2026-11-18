import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { inviteMemberRequestSchema, invitationCreatedSchema, teamResponseSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
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
}
