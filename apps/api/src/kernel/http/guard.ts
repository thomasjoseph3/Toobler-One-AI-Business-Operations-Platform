import type { FastifyInstance, FastifyRequest } from 'fastify';
import { forbidden, notFound, unauthorized } from '../errors';
import type { ModuleGate } from '../module-system/registry';
import type { PublicRoute } from './public-routes';

export type Access = 'public' | 'staff' | 'manager';

/** Who is signed in. Sessions arrive in F01; until then nobody is. */
export interface Principal {
  accountId: string;
  userId: string;
  role: 'manager' | 'staff' | 'staff_own';
}

/** Turns the request's credentials into a Principal, or throws 401. Replaced by the real session check in F01. */
export type Authenticator = (request: FastifyRequest) => Promise<Principal>;

/** The stand-in authenticator until sessions exist (F01): every request is refused with 401. */
export const rejectEveryone: Authenticator = async () => {
  throw unauthorized();
};

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Required on every route: who may call it. */
    access?: Access;
    /** Set by the kernel for routes a module registers: the route 404s when that module is off. */
    moduleId?: string;
  }
  interface FastifyRequest {
    principal?: Principal;
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
  options: { authenticate: Authenticator; gate: ModuleGate; publicRoutes: readonly PublicRoute[] },
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
      const { access: requiredAccess, moduleId } = request.routeOptions.config;
      if (requiredAccess === 'public') return;
      const principal = await options.authenticate(request);
      request.principal = principal;
      if (requiredAccess === 'manager' && principal.role !== 'manager') throw forbidden();
      if (moduleId && !(await options.gate.isActive(principal.accountId, moduleId))) throw notFound();
    };
    const existingPreHandlers = route.preHandler ? [route.preHandler].flat() : [];
    route.preHandler = [checkAccessBeforeHandler, ...existingPreHandlers] as typeof route.preHandler;
  });
}
