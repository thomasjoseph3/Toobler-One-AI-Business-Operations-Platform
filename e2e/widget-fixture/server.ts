import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A pretend chat service and two pretend customer websites, for the browser tests of the website chat. The real loader and the real chat
// window (the apps/site build) are served as they are; only the API behind them is pretend. The real API's rules are tested in apps/api.
//
//   http://127.0.0.1:3200  the chat service: /widget/... files and /api/v1/public/widget/... (pretend)
//   http://127.0.0.1:3201  a customer website that is on the business's allowed list
//   http://127.0.0.1:3202  a website that is NOT on the list

const SERVICE_PORT = 3200;
const ALLOWED_SITE_PORT = 3201;
const OTHER_SITE_PORT = 3202;
const ALLOWED_ORIGIN = `http://127.0.0.1:${ALLOWED_SITE_PORT}`;
export const WIDGET_KEY = 'wk_abcdefghijklmnopqrstuvwxyz012345';
const BUILD_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/site/dist');
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

interface PretendChat {
  messages: Array<{ sender: 'customer' | 'agent'; body: string; createdAt: string }>;
  ended: boolean;
}
const chats = new Map<string, PretendChat>();
let nextChatNumber = 1;
/** Reads a request's body as JSON ({} when empty). */
async function readJson(request: IncomingMessage): Promise<{ message?: string }> {
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(part as Buffer);
  const text = Buffer.concat(parts).toString('utf8');
  return text === '' ? {} : (JSON.parse(text) as { message?: string });
}

/** Sends JSON. */
function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** Sends a built file from the apps/site build, or 404. */
async function sendBuiltFile(
  response: ServerResponse,
  relativePath: string,
  extraHeaders: Record<string, string> = {},
) {
  try {
    const content = await readFile(path.join(BUILD_DIRECTORY, relativePath));
    response.writeHead(200, { 'content-type': TYPES[path.extname(relativePath)] ?? 'text/plain', ...extraHeaders });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('not built');
  }
}

/** The pretend chat service. */
const service = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${SERVICE_PORT}`);
  const origin = request.headers.origin;
  const fromAllowedSite = origin === ALLOWED_ORIGIN;
  const fromOwnWindow = request.headers['sec-fetch-site'] === 'same-origin';

  if (url.pathname === '/widget/loader.js')
    return sendBuiltFile(response, 'loader.js', { 'cross-origin-resource-policy': 'cross-origin' });
  if (url.pathname === '/widget/chat') {
    return sendBuiltFile(response, 'chat.html', {
      'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors ${ALLOWED_ORIGIN}`,
    });
  }
  if (url.pathname.startsWith('/widget/assets/')) return sendBuiltFile(response, url.pathname.replace('/widget/', ''));

  const routeMatch = /^\/api\/v1\/public\/widget\/([^/]+)\/(config|messages|end)$/.exec(url.pathname);
  if (!routeMatch || routeMatch[1] !== WIDGET_KEY) {
    return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'No' } });
  }
  const [, , part] = routeMatch;

  // The pretend service answers browsers on the allowed website and the chat window itself; the permission check says so
  if (fromAllowedSite) {
    response.setHeader('access-control-allow-origin', ALLOWED_ORIGIN);
    response.setHeader('vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    if (fromAllowedSite) {
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      response.setHeader('access-control-allow-headers', 'content-type, authorization');
    }
    response.writeHead(204);
    return response.end();
  }
  if (!fromAllowedSite && !fromOwnWindow) {
    return sendJson(response, 403, { error: { code: 'WEBSITE_NOT_ALLOWED', message: 'No' } });
  }

  if (part === 'config' && request.method === 'GET') {
    return sendJson(response, 200, {
      colour: '#1F6FEB',
      greeting: 'Welcome to Nair Stays! Ask me anything.',
      position: 'bottom_right',
      buttons: [
        { kind: 'chat', link: null },
        { kind: 'call', link: 'tel:+919847012345' },
        { kind: 'whatsapp', link: 'https://wa.me/919847099999?text=Hello' },
      ],
    });
  }

  const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
  const knownChat = token ? chats.get(token) : undefined;

  if (part === 'messages' && request.method === 'GET') {
    if (!knownChat) return sendJson(response, 401, { error: { code: 'VISITOR_TOKEN_INVALID', message: 'No' } });
    return sendJson(response, 200, { messages: knownChat.messages, ended: knownChat.ended });
  }
  if (part === 'messages' && request.method === 'POST') {
    const { message } = await readJson(request);
    // A message that starts with FAIL- makes the pretend service fail the way the real one does when the AI is down (stateless, so tests
    // running side by side never disturb each other)
    if (message?.startsWith('FAIL-')) {
      return sendJson(response, 503, { error: { code: 'ASSISTANT_UNAVAILABLE', message: 'Technical words' } });
    }
    let chatToken = token;
    let chat = knownChat;
    if (!chat || chat.ended) {
      chatToken = `pretend-token-${nextChatNumber}`;
      nextChatNumber += 1;
      chat = { messages: [], ended: false };
      chats.set(chatToken, chat);
    }
    const now = new Date().toISOString();
    chat.messages.push({ sender: 'customer', body: message ?? '', createdAt: now });
    const reply = `You said: ${message ?? ''}`;
    chat.messages.push({ sender: 'agent', body: reply, createdAt: now });
    return sendJson(response, 200, { reply, visitorToken: chatToken, newChat: !knownChat || knownChat.ended });
  }
  if (part === 'end' && request.method === 'POST') {
    if (!knownChat) return sendJson(response, 401, { error: { code: 'VISITOR_TOKEN_INVALID', message: 'No' } });
    knownChat.ended = true;
    return sendJson(response, 200, { ended: true });
  }
  return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'No' } });
});

/** A pretend customer website: a plain page with the one pasted line. */
function startWebsite(port: number, name: string) {
  createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title></head>` +
        `<body><h1>${name}</h1><p>Some words on the business's own page.</p>` +
        `<script src="http://127.0.0.1:${SERVICE_PORT}/widget/loader.js" data-key="${WIDGET_KEY}" async></script></body></html>`,
    );
  }).listen(port, '127.0.0.1');
}

service.listen(SERVICE_PORT, '127.0.0.1');
startWebsite(ALLOWED_SITE_PORT, 'Nair Stays');
startWebsite(OTHER_SITE_PORT, 'Some other website');
console.log(`Widget test servers ready on ${SERVICE_PORT}, ${ALLOWED_SITE_PORT} and ${OTHER_SITE_PORT}`);
