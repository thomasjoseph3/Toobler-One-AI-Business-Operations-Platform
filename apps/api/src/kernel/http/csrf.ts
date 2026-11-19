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
/**
 * The public chat routes are called from the business's own website, never from our web app, so they cannot carry our Origin and header.
 * They are protected another way: every call must come from a website the business listed, and a chat is carried on only with a signed
 * visitor token (no cookie is ever used, so there is nothing for another site to ride on).
 */
const PUBLIC_WIDGET_PATH_START = '/api/v1/public/widget/';
/** The provider webhooks (WhatsApp, and later others) are called by the provider's servers, not by a browser. The provider's signature on every call takes the place of the CSRF check. */
const WEBHOOK_PATH_START = '/webhooks/';

export function registerCsrfProtection(app: FastifyInstance, options: { allowedOrigins: readonly string[] }) {
  app.addHook('onRequest', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
    if (request.url.startsWith(PUBLIC_WIDGET_PATH_START)) return;
    if (request.url.startsWith(WEBHOOK_PATH_START)) return;
    const hasOurOrigin = options.allowedOrigins.includes(request.headers.origin ?? '');
    const hasOurHeader = request.headers[CSRF_HEADER_NAME] === CSRF_HEADER_VALUE;
    if (!hasOurOrigin || !hasOurHeader) {
      throw new ApiError(403, 'CSRF_REJECTED', 'This request did not come from the Toobler One app.');
    }
  });
}
