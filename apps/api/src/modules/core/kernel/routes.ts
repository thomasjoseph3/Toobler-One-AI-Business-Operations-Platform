import type { FastifyInstance } from 'fastify';

/** Registers the infrastructure routes every deployment has. Today that is only GET /api/v1/health. */
export function kernelRoutes(app: FastifyInstance) {
  // Up only when everything a request needs answers. Public by design (public-routes.ts); says only up or down.
  app.get('/health', { config: { access: 'public' } }, async (request, reply) => {
    const databaseCheck = { name: 'database', check: () => app.kernel.database.ping() };
    for (const { name, check } of [databaseCheck, ...app.kernel.healthChecks]) {
      try {
        await check();
      } catch (error) {
        request.log.error({ err: error, check: name }, 'health check failed');
        return reply.code(503).send({ ok: false, error: `${name} is not responding` });
      }
    }
    return { ok: true };
  });
}
