import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from './csrf';

/** The methods that only read. Everything else must carry our CSRF header, so the docs page pre-fills it. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Serves the API documentation, DEVELOPMENT ONLY (the caller checks). `/docs` is a page where every route can be read and
 * tried; `/docs/json` is the OpenAPI file, which can be imported into Postman. The document is built from the routes'
 * own zod shapes, so it cannot drift from the code. Routes are grouped by module, and each one says who may call it.
 * Call it before the module routes are registered, so the documentation sees them.
 */
export async function registerApiDocs(app: FastifyInstance, options: { docsOrigin: string }): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Toobler One API',
        version: '0.0.0',
        description:
          'Development documentation, generated from the code. To try a route that needs sign-in, first run ' +
          '`POST /api/v1/auth/login` here: your browser keeps the cookie and the other routes then work as you. ' +
          'Changes made here change the development database.',
      },
      servers: [{ url: options.docsOrigin }],
    },
    // Turns each route's zod shapes into OpenAPI, then adds what the code knows about the route: its module, who may
    // call it, and (for routes that change things) the header our CSRF check needs, already filled in.
    transform: (transformInput) => {
      const converted = jsonSchemaTransform(transformInput);
      const route = transformInput.route;
      const access = route.config?.access;
      const moduleId = route.config?.moduleId;
      const isChange = !READ_ONLY_METHODS.has(String(route.method));
      const schema = { ...(converted.schema as Record<string, unknown>) };
      if (moduleId) schema.tags = [moduleId];
      if (access) {
        const previous = typeof schema.description === 'string' ? `${schema.description}\n\n` : '';
        schema.description = `${previous}**Who may call it:** ${access}`;
      }
      if (isChange) {
        const previousHeaders = (schema.headers ?? { type: 'object', properties: {} }) as {
          properties?: Record<string, unknown>;
          required?: string[];
        };
        schema.headers = {
          ...previousHeaders,
          type: 'object',
          properties: {
            ...previousHeaders.properties,
            [CSRF_HEADER_NAME]: {
              type: 'string',
              default: CSRF_HEADER_VALUE,
              description: 'Sent by our web app on every change.',
            },
          },
          required: [...(previousHeaders.required ?? []), CSRF_HEADER_NAME],
        };
      }
      return { schema: schema as typeof converted.schema, url: converted.url };
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
}
