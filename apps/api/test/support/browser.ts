import type { FastifyInstance } from 'fastify';
import { unsafeRequestHeaders } from './app';

/** The cookies a browser keeps for one person on one device, and the requests it makes with them. */
export interface PretendBrowser {
  /** Sends a request the way our web app would: the right headers, plus whichever cookies the browser would attach. */
  send(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
  ): Promise<Awaited<ReturnType<FastifyInstance['inject']>>>;
  /** The names of the cookies the browser holds right now. */
  cookieNames(): string[];
  /** The value of one cookie, or undefined (what a thief with access to the browser could copy). */
  cookieValue(name: string): string | undefined;
  /** Puts a cookie into the browser, as if copied from another one. */
  setCookie(name: string, value: string): void;
}

/**
 * A pretend browser for journey tests. Like a real one it stores the cookies the server sets, deletes the ones the server
 * empties, and sends the refresh cookie only to the refresh address (that is the path it was set for).
 */
export function createPretendBrowser(app: FastifyInstance): PretendBrowser {
  const cookieJar = new Map<string, string>();
  return {
    async send(method, url, payload) {
      const cookiesToSend = [...cookieJar.entries()]
        .filter(([name]) => name !== 'toobler_refresh' || url.startsWith('/api/v1/auth/refresh'))
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      const response = await app.inject({
        method,
        url,
        headers: {
          ...(method === 'GET' ? {} : unsafeRequestHeaders),
          ...(cookiesToSend ? { cookie: cookiesToSend } : {}),
        },
        ...(payload ? { payload } : {}),
      });
      for (const cookie of response.cookies) {
        if (cookie.value === '') cookieJar.delete(cookie.name);
        else cookieJar.set(cookie.name, cookie.value);
      }
      return response;
    },
    cookieNames: () => [...cookieJar.keys()],
    cookieValue: (name) => cookieJar.get(name),
    setCookie: (name, value) => void cookieJar.set(name, value),
  };
}
