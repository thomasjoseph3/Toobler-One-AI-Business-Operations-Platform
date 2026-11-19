import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createTeamRequestSchema,
  teamIdParamsSchema,
  teamSchema,
  teamsResponseSchema,
  updateTeamRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createTeamsService } from '../services/teams.service';

/** Registers GET and POST /api/v1/teams (the business's teams and add one) and PATCH and DELETE /api/v1/teams/{id} (change or remove one). */
export function teamsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const teamsService = createTeamsService({ database: app.kernel.database });

  // For any signed-in, verified person: team names and the names of their people, which every colleague already sees next to leads and tasks.
  typedApp.get(
    '/teams',
    { config: { access: 'staff' }, schema: { response: { 200: teamsResponseSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return teamsService.listTeams(request.principal);
    },
  );

  // Managers only. The business comes from the session, never from the request.
  typedApp.post(
    '/teams',
    { config: { access: 'manager' }, schema: { body: createTeamRequestSchema, response: { 201: teamSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const team = await teamsService.createTeam(request.principal, request.body);
      return reply.code(201).send(team);
    },
  );

  // Managers only: rename a team and/or replace its people.
  typedApp.patch(
    '/teams/:id',
    {
      config: { access: 'manager' },
      schema: { params: teamIdParamsSchema, body: updateTeamRequestSchema, response: { 200: teamSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return teamsService.updateTeam(request.principal, request.params.id, request.body);
    },
  );

  // Managers only: remove a team (its people stay).
  typedApp.delete(
    '/teams/:id',
    { config: { access: 'manager' }, schema: { params: teamIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await teamsService.deleteTeam(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
