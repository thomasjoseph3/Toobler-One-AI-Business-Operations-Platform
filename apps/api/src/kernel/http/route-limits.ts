import type { FastifyInstance } from 'fastify';

// How often one address may call the routes that anyone can reach, or that send email. These are on top of the app-wide
// limit. Over the limit the answer is 429 TOO_MANY_REQUESTS.

/** A limit: at most `max` calls from one address in `timeWindow`. */
export interface RouteLimit {
  max: number;
  timeWindow: string;
}

/** The limits, by name. */
export const ROUTE_LIMITS = {
  login: { max: 10, timeWindow: '1 minute' },
  signUp: { max: 10, timeWindow: '1 hour' },
  verifyEmail: { max: 20, timeWindow: '1 minute' },
  refresh: { max: 30, timeWindow: '1 minute' },
  resendEmail: { max: 3, timeWindow: '10 minutes' },
  forgotPassword: { max: 3, timeWindow: '10 minutes' },
  resetPassword: { max: 10, timeWindow: '1 minute' },
} as const satisfies Record<string, RouteLimit>;

/**
 * The bit to spread into a route's `config` to apply a named limit: `config: { access: 'public', ...routeLimit(app, 'login') }`.
 * When the app runs with relaxed limits (tests that create many people from one address) it adds nothing.
 */
export function routeLimit(app: FastifyInstance, name: keyof typeof ROUTE_LIMITS) {
  return app.kernel.strictRouteLimits ? { rateLimit: { ...ROUTE_LIMITS[name] } } : {};
}
