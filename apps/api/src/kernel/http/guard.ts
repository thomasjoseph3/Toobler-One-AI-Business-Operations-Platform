import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ApiError, forbidden, notFound, unauthorized } from '../errors';
import type { RequestContext } from '../context';
import type { ModuleGate } from '../modules/registry';
import type { PublicRoute } from './public-routes';

export type Access = 'public' | 'staff' | 'manager';

/** Who is signed in: the person, their business and role, the session they are using, and whether their email is verified. */
export interface Principal {
  accountId: string;
  userId: string;
  role: 'manager' | 'staff' | 'staff_own';
  sessionId: string;
  emailVerified: boolean;
}

/** Turns the request's credentials into a Principal, or throws 401. The real one comes from the `core.auth` module. */
export type Authenticator = (request: FastifyRequest) => Promise<Principal>;

/** Used when no module provides an authenticator (the kernel alone): every request is refused with 401. */
export const rejectEveryone: Authenticator = async () => {
  throw unauthorized();
};

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Required on every route: who may call it. */
    access?: Access;
    /** Set by the kernel for routes a module registers: the route 404s when that module is off. */
    moduleId?: string;
    /** Lets a signed-in person whose email is not verified yet use the route (verify, resend, sign out, /me). Default: refused. */
    allowUnverified?: boolean;
  }
  interface FastifyRequest {
    principal?: Principal;
    requestContext?: RequestContext;
  }
}

/**
 * Makes the security rules impossible to forget:
 *  - a route without `config.access` stops the app from starting;
 *  - a `public` route must be listed in public-routes.ts;
 *  - `staff` and `manager` routes are authenticated and role-checked before the handler;
 *  - a module's routes answer 404 for a business that doesn't have the module on.
 */
export function registerGuard(
  app: FastifyInstance,
  options: {
    authenticate: Authenticator;
    gate: ModuleGate;
    publicRoutes: readonly PublicRoute[];
    buildRequestContext: (principal: Principal) => RequestContext;
  },
) {
  const listedPublicRouteKeys = new Set(
    options.publicRoutes.map((publicRoute) => `${publicRoute.method} ${publicRoute.path}`),
  );

  // Runs once for every route as it is registered, so a badly declared route stops the app at start-up.
  app.addHook('onRoute', (route) => {
    const httpMethods = [route.method].flat();
    const routeAccess = route.config?.access;
    if (!routeAccess) {
      throw new Error(
        `Route ${httpMethods.join('|')} ${route.url} has no config.access. Declare who may call it: 'public', 'staff' or 'manager'.`,
      );
    }
    if (routeAccess === 'public') {
      for (const httpMethod of httpMethods) {
        if (httpMethod === 'HEAD') continue; // Fastify adds HEAD for every GET
        if (!listedPublicRouteKeys.has(`${httpMethod} ${route.url}`)) {
          throw new Error(
            `Public route ${httpMethod} ${route.url} is not listed in kernel/http/public-routes.ts (with a reason).`,
          );
        }
      }
    }

    // Runs before the route's own handler on every request: signs the caller in, checks the role, checks the module is on.
    const checkAccessBeforeHandler = async (request: FastifyRequest) => {
      const { access: requiredAccess, moduleId, allowUnverified } = request.routeOptions.config;
      if (requiredAccess === 'public') return;
      const principal = await options.authenticate(request);
      request.principal = principal;
      request.requestContext = options.buildRequestContext(principal);
      // A person who has not verified their email yet can reach only the routes that say so (docs/features/F01).
      if (!principal.emailVerified && !allowUnverified) {
        throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address first.');
      }
      if (requiredAccess === 'manager' && principal.role !== 'manager') throw forbidden();
      if (moduleId && !(await options.gate.isActive(principal.accountId, moduleId))) throw notFound();
    };
    const existingPreHandlers = route.preHandler ? [route.preHandler].flat() : [];
    route.preHandler = [checkAccessBeforeHandler, ...existingPreHandlers] as typeof route.preHandler;
  });
}
