import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  companiesListResponseSchema,
  companySchema,
  createCompanyRequestSchema,
  listCompaniesQuerySchema,
} from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createCompaniesService } from '../services/companies.service';

/** Registers GET /api/v1/companies (the list) and POST /api/v1/companies (add a company). */
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
}
