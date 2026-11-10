import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Config } from './kernel/config';
import { createContextFactory, type ContextFactory } from './kernel/context';
import type { Database } from './kernel/database';
import type { HealthCheck } from './kernel/health';
import { registerCsrfProtection } from './kernel/http/csrf';
import { registerErrorHandling } from './kernel/http/errors';
import { registerGuard, rejectEveryone, type Authenticator } from './kernel/http/guard';
import { PUBLIC_ROUTES, type PublicRoute } from './kernel/http/public-routes';
import { loggerOptions } from './kernel/logger';
import { createMailSender, type MailSender } from './providers/mail';
import type { ModuleGate, Registry } from './kernel/module-system/registry';
import { coreOnlyGate } from './kernel/module-system/registry';

export type { HealthCheck };

/** What the kernel offers to module routes: reached as `app.kernel`. */
export interface Kernel {
  config: Config;
  database: Database;
  registry: Registry;
  gate: ModuleGate;
  /** Builds the context (business + actor + fenced transaction + audit + publish) for work done on a business's behalf. */
  contextFor: ContextFactory;
  healthChecks: HealthCheck[];
  /** Sends email. Modules use it through `app.kernel.mail`, never by importing the provider. */
  mail: MailSender;
  /** Whether the per-route limits (login, sign-up, ...) apply. On unless a test turns it off. */
  strictRouteLimits: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    kernel: Kernel;
  }
}

export interface AppDeps {
  config: Config;
  database: Database;
  registry: Registry;
  gate?: ModuleGate;
  /** Overrides the authenticator a module provides. Tests use this to act as a signed-in person without cookies. */
  authenticate?: Authenticator;
  publicRoutes?: readonly PublicRoute[];
  healthChecks?: HealthCheck[];
  /** Replaces the mail sender the settings choose. Tests pass a recording one so no email is really sent. */
  mailSender?: MailSender;
  /** Turn the per-route limits off (default on). Tests that create many people from one address use this. */
  strictRouteLimits?: boolean;
  /** Requests per window per address; public routes get their own tighter limits. */
  rateLimit?: { max: number; timeWindow: string };
  /** Tests capture log lines here. */
  logger?: FastifyBaseLogger;
}

export type App = FastifyInstance;

/**
 * Builds the web server with everything attached (validation, security headers, rate limit, error handling, the access
 * guard and every module's routes) but does not start listening. server.ts starts it; tests call it directly.
 */
export async function buildApp(dependencies: AppDeps): Promise<FastifyInstance> {
  const { config, database, registry } = dependencies;
  const app = Fastify({
    ...(dependencies.logger ? { loggerInstance: dependencies.logger } : { logger: loggerOptions(config) }),
    trustProxy: config.trustProxy,
    genReqId: () => randomUUID(), // never trust a caller's request id
    requestIdHeader: false,
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  // Check incoming requests and outgoing responses against the Zod schemas written on each route.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  const gate = dependencies.gate ?? coreOnlyGate(registry);
  app.decorate('kernel', {
    config,
    database,
    registry,
    gate,
    contextFor: createContextFactory(database),
    healthChecks: dependencies.healthChecks ?? [],
    strictRouteLimits: dependencies.strictRouteLimits ?? true,
    mail: dependencies.mailSender ?? createMailSender(config, (line) => app.log.info(line)),
  });

  // The authenticator comes from the module that provides one (core.auth). With none, every signed-in route answers 401.
  const authenticatorFactory = registry.modules.find((moduleManifest) => moduleManifest.authenticator)?.authenticator;
  const authenticate = dependencies.authenticate ?? authenticatorFactory?.({ config, database }) ?? rejectEveryone;

  registerErrorHandling(app);
  registerCsrfProtection(app, { allowedOrigin: config.webUrl }); // changes need our Origin and header
  await app.register(cookie); // lets routes set and read cookies (the sign-in cookies)
  await app.register(helmet);
  await app.register(rateLimit, { global: true, ...(dependencies.rateLimit ?? { max: 300, timeWindow: '1 minute' }) });
  registerGuard(app, {
    authenticate,
    gate,
    publicRoutes: dependencies.publicRoutes ?? PUBLIC_ROUTES,
  });

  // Each module's routes live under /api/v1 and answer 404 when the module is off for the business.
  for (const moduleManifest of registry.modules) {
    if (!moduleManifest.routes) continue;
    const registerModuleRoutes = moduleManifest.routes;
    await app.register(
      async (moduleScope) => {
        // Tag every route of this module with the module's id, so the guard can check the module is on.
        moduleScope.addHook('onRoute', (route) => {
          route.config = { ...route.config, moduleId: moduleManifest.id };
        });
        await registerModuleRoutes(moduleScope);
      },
      { prefix: '/api/v1' },
    );
  }
  return app;
}
