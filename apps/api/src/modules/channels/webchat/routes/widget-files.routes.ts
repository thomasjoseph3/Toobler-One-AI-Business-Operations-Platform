import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { widgetKeyParamsSchema } from '@toobler-one/shared';
import { routeLimit } from '../../../../kernel/http/route-limits';
import { isOpenedAsFrame, makeChatPagePolicy } from '../helpers/chat-page-security';
import { createWidgetFilesService, type WidgetFile } from '../services/widget-files.service';
import { findSettingsByWidgetKey } from '../repositories/webchat-settings.repository';

const chatPageQuerySchema = z.object({ key: widgetKeyParamsSchema.shape.key });
const assetParamsSchema = z.object({ file: z.string().min(1).max(120) });
const testPageQuerySchema = z.object({ key: z.string().optional() });

/** Sends a built file, or 404 when it is not there (the widget has not been built). */
function sendFile(reply: FastifyReply, file: WidgetFile | undefined, cacheControl: string) {
  if (!file) return reply.code(404).type('text/plain').send('Not found');
  return reply.type(file.contentType).header('cache-control', cacheControl).send(file.content);
}

/**
 * Registers what a business's website loads, served from the API's own address: /widget/loader.js (the tiny script the pasted line loads),
 * /widget/chat (the chat window's page, shown in an iframe), /widget/assets/{file} (its script and styles) and, in development only,
 * /widget/test (a page to try the bubble on). No sign-in, and the same files for every business.
 */
export function widgetFilesRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { database, gate, config } = app.kernel;
  const files = createWidgetFilesService(config.widgetFilesDirectory ? { directory: config.widgetFilesDirectory } : {});

  // The loader is loaded by OTHER websites, so (unlike every other answer) it must say that any website may load it. It changes only when we
  // build a new version, so it is kept for five minutes.
  typedApp.get(
    '/widget/loader.js',
    { config: { access: 'public', ...routeLimit(app, 'widgetFile') }, schema: { tags: ['channel.webchat'] } },
    async (_request, reply) => {
      reply.header('cross-origin-resource-policy', 'cross-origin');
      return sendFile(reply, await files.readLoader(), 'public, max-age=300');
    },
  );

  // The chat window's own script and styles: their names carry a fingerprint of their content, so they can be kept for a year
  typedApp.get(
    '/widget/assets/:file',
    {
      config: { access: 'public', ...routeLimit(app, 'widgetFile') },
      schema: { tags: ['channel.webchat'], params: assetParamsSchema },
    },
    async (request, reply) =>
      sendFile(reply, await files.readAsset(request.params.file), 'public, max-age=31536000, immutable'),
  );

  // The chat window's page. Shown only inside a frame, and only for a business whose chat is on and that has listed its websites; the
  // browser is told (frame-ancestors) that only those websites may frame it. Every other page of the app can never be framed.
  typedApp.get(
    '/widget/chat',
    {
      config: { access: 'public', ...routeLimit(app, 'widgetConfig') },
      schema: { tags: ['channel.webchat'], querystring: chatPageQuerySchema },
    },
    async (request, reply) => {
      const found = await findSettingsByWidgetKey(database.system, request.query.key);
      const isAvailable =
        found !== undefined &&
        found.settings.allowedWebsites.length > 0 &&
        isOpenedAsFrame(request.headers['sec-fetch-dest']) &&
        (await gate.isActive(found.accountId, 'channel.webchat'));
      if (!found || !isAvailable) return reply.code(404).type('text/plain').send('Not found');
      // The app-wide rule says "never framed" (X-Frame-Options and a frame-ancestors of 'self'): this page replaces both with its own
      reply.removeHeader('x-frame-options');
      reply.header('content-security-policy', makeChatPagePolicy(found.settings.allowedWebsites));
      return sendFile(reply, await files.readChatPage(), 'no-store');
    },
  );

  // A page to try the bubble on. Development only: it does not exist in production. The pasted line is the same one a business uses.
  if (config.env !== 'production') {
    typedApp.get(
      '/widget/test',
      {
        config: { access: 'public', ...routeLimit(app, 'widgetFile') },
        schema: { tags: ['channel.webchat'], querystring: testPageQuerySchema },
      },
      async (request, reply) => {
        const key = request.query.key ?? '';
        const keyLooksRight = /^wk_[A-Za-z0-9_-]{32}$/.test(key);
        const snippet = keyLooksRight
          ? `<script src="/widget/loader.js" data-key="${key}" async></script>`
          : '<p>Open this page as <code>/widget/test?key=YOUR_WIDGET_KEY</code>.</p>';
        // The helmet default policy (own scripts only) is exactly what this page needs
        return reply
          .type('text/html; charset=utf-8')
          .send(
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
              `<title>Chat bubble test page</title></head><body style="font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">` +
              `<h1>Chat bubble test page</h1><p>This page stands in for a business's website. The chat bubble should appear in the corner. ` +
              `For it to work, this page's address (<code>${config.publicBaseUrl}</code>) must be on the business's allowed websites.</p>` +
              `${snippet}</body></html>`,
          );
      },
    );
  }
}
