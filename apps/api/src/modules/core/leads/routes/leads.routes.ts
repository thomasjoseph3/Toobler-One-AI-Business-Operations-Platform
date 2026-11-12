import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  assignLeadRequestSchema,
  createLeadRequestSchema,
  leadIdParamsSchema,
  leadSchema,
  leadsResponseSchema,
  listLeadsQuerySchema,
  moveLeadRequestSchema,
  updateLeadRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createLeadsService } from '../services/leads.service';

/** Registers /api/v1/leads (add, list or board), /leads/{id} (read, change details), /leads/{id}/move and /leads/{id}/assign. */
export function leadsRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const leadsService = createLeadsService({ database: app.kernel.database });

  // For any signed-in, verified person: staff add leads. The business comes from the session, never from the request.
  typedApp.post(
    '/leads',
    { config: { access: 'staff' }, schema: { body: createLeadRequestSchema, response: { 201: leadSchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const lead = await leadsService.createLead(request.principal, request.body);
      return reply.code(201).send(lead);
    },
  );

  // For any signed-in, verified person. A plain read: `?view=board` answers with a column per stage.
  typedApp.get(
    '/leads',
    {
      config: { access: 'staff' },
      schema: { querystring: listLeadsQuerySchema, response: { 200: leadsResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return leadsService.listLeads(request.principal, request.query);
    },
  );

  // For any signed-in, verified person. Another business's lead, a deleted one and an unknown id all answer 404.
  typedApp.get(
    '/leads/:id',
    { config: { access: 'staff' }, schema: { params: leadIdParamsSchema, response: { 200: leadSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return leadsService.getLead(request.principal, request.params.id);
    },
  );

  // For any signed-in, verified person. Only the fields sent change; the body may not name the stage, owner or anything else.
  typedApp.patch(
    '/leads/:id',
    {
      config: { access: 'staff' },
      schema: { params: leadIdParamsSchema, body: updateLeadRequestSchema, response: { 200: leadSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return leadsService.updateLead(request.principal, request.params.id, request.body);
    },
  );

  // For any signed-in, verified person. Lost needs a reason from the business's list; Won and Lost close the lead.
  typedApp.post(
    '/leads/:id/move',
    {
      config: { access: 'staff' },
      schema: { params: leadIdParamsSchema, body: moveLeadRequestSchema, response: { 200: leadSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return leadsService.moveLead(request.principal, request.params.id, request.body);
    },
  );

  // For any signed-in, verified person. The new owner must work for the same business, otherwise 404.
  typedApp.post(
    '/leads/:id/assign',
    {
      config: { access: 'staff' },
      schema: { params: leadIdParamsSchema, body: assignLeadRequestSchema, response: { 200: leadSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return leadsService.assignLead(request.principal, request.params.id, request.body);
    },
  );

  // For managers only (the guard answers 403 to staff). A soft delete: the lead disappears, its data is kept.
  typedApp.delete(
    '/leads/:id',
    { config: { access: 'manager' }, schema: { params: leadIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await leadsService.deleteLead(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
