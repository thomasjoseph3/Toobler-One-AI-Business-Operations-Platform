import type { FastifyInstance } from 'fastify';
import { ApiError } from '../errors';

/** The header our own web app adds to every request that changes something. A form on another website cannot add it. */
export const CSRF_HEADER_NAME = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'toobler-web';

/**
 * Cross-site request forgery protection (docs/SECURITY.md 2.2). Every request that is not a plain read must come from our
 * own web address (the `Origin` header; in development also the API docs page) and carry our custom header. Together with the SameSite cookies, a page on
 * another website cannot make a signed-in person's browser change anything here. In Postman, add both headers.
 */
export function registerCsrfProtection(app: FastifyInstance, options: { allowedOrigins: readonly string[] }) {
  app.addHook('onRequest', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
    const hasOurOrigin = options.allowedOrigins.includes(request.headers.origin ?? '');
    const hasOurHeader = request.headers[CSRF_HEADER_NAME] === CSRF_HEADER_VALUE;
    if (!hasOurOrigin || !hasOurHeader) {
      throw new ApiError(403, 'CSRF_REJECTED', 'This request did not come from the Toobler One app.');
    }
  });
}
