import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { assignmentRulesSchema, replaceAssignmentRulesRequestSchema } from '@toobler-one/shared';
import { unauthorized } from '../../../../kernel/errors';
import { createAssignmentRulesService } from '../services/assignment-rules.service';

/** Registers /api/v1/assignment-rules (read the rule, replace the rule). Both are for managers. */
export function assignmentRulesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const assignmentRulesService = createAssignmentRulesService({ database: app.kernel.database });

  // For managers only (the guard answers 403 to staff): how leads are shared out is a business decision.
  typedApp.get(
    '/assignment-rules',
    { config: { access: 'manager' }, schema: { response: { 200: assignmentRulesSchema } } },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return assignmentRulesService.getAssignmentRules(request.principal);
    },
  );

  // For managers only. The business comes from the session; every person named must work for it, otherwise 404.
  typedApp.put(
    '/assignment-rules',
    {
      config: { access: 'manager' },
      schema: { body: replaceAssignmentRulesRequestSchema, response: { 200: assignmentRulesSchema } },
    },
    async (request) => {
      if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
      return assignmentRulesService.replaceAssignmentRules(request.principal, request.body);
    },
  );
}
