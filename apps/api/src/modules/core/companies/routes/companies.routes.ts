import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  companiesListResponseSchema,
  companyDetailSchema,
  companyIdParamsSchema,
  companySchema,
  contactSchema,
  createCompanyRequestSchema,
  linkContactParamsSchema,
  listCompaniesQuerySchema,
  setContactCompanyRequestSchema,
  updateCompanyRequestSchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createCompaniesService } from '../services/companies.service';

/** Registers /api/v1/companies (list, add), GET /api/v1/companies/{id} (one company with its people and leads) and PUT /api/v1/contacts/{id}/company (link a contact). */
export function companiesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const companiesService = createCompaniesService({ database: app.kernel.database });

  // For any signed-in, verified person. A plain read; the business comes from the session, never from the request.
  typedApp.get(
    '/companies',
    {
      config: { access: 'staff' },
      schema: { querystring: listCompaniesQuerySchema, response: { 200: companiesListResponseSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return companiesService.listCompanies(request.principal, request.query);
    },
  );

  // For any signed-in, verified person (API.md: Staff). The person adding it looks after it unless an owner is named.
  typedApp.post(
    '/companies',
    { config: { access: 'staff' }, schema: { body: createCompanyRequestSchema, response: { 201: companySchema } } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      const company = await companiesService.createCompany(request.principal, request.body);
      return reply.code(201).send(company);
    },
  );

  // For any signed-in, verified person. The "own leads only" role sees only the leads it owns.
  typedApp.get(
    '/companies/:id',
    { config: { access: 'staff' }, schema: { params: companyIdParamsSchema, response: { 200: companyDetailSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return companiesService.getCompany(request.principal, request.params.id);
    },
  );

  // For any signed-in, verified person (API.md: Staff). `{ "companyId": null }` takes the contact out of its company.
  typedApp.put(
    '/contacts/:id/company',
    {
      config: { access: 'staff' },
      schema: {
        params: linkContactParamsSchema,
        body: setContactCompanyRequestSchema,
        response: { 200: contactSchema },
      },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return companiesService.setCompanyOfContact(request.principal, request.params.id, request.body.companyId);
    },
  );

  // For any signed-in, verified person (API.md: Staff). Only the fields sent change.
  typedApp.patch(
    '/companies/:id',
    {
      config: { access: 'staff' },
      schema: { params: companyIdParamsSchema, body: updateCompanyRequestSchema, response: { 200: companySchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return companiesService.updateCompany(request.principal, request.params.id, request.body);
    },
  );

  // Managers only (API.md). The company's people are not deleted: they just lose the link.
  typedApp.delete(
    '/companies/:id',
    { config: { access: 'manager' }, schema: { params: companyIdParamsSchema } },
    async (request, reply) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      await companiesService.deleteCompany(request.principal, request.params.id);
      return reply.code(204).send();
    },
  );
}
