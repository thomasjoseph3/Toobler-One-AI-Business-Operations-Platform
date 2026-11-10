import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { MailMessage, MailProvider } from '../../src/providers/mail';
import { unsafeRequestHeaders } from './app';

/** A mail provider that keeps what it was asked to send, so tests can read the links without any mail server. */
export function createMemoryMail() {
  const sent: MailMessage[] = [];
  const provider: MailProvider = {
    async send(message) {
      sent.push(message);
    },
  };
  /** The emails sent to an address, newest last. */
  const sentTo = (address: string) => sent.filter((message) => message.to === address);
  /** The secret in the newest link emailed to an address (the part after `token=`). */
  const latestToken = (address: string): string => {
    const message = sentTo(address).at(-1);
    const match = message?.text.match(/token=([^\s]+)/);
    if (!match?.[1]) throw new Error(`No email with a link was sent to ${address}`);
    return decodeURIComponent(match[1]);
  };
  return { provider, sent, sentTo, latestToken };
}

interface StoredCookie {
  value: string;
  path: string;
}

/**
 * Stands in for one browser: remembers the cookies the API sets and sends them back the way a browser does (a cookie only
 * goes to addresses under its path, and is dropped when the API clears it). Adds the headers our web app adds.
 */
export class TestBrowser {
  readonly cookies = new Map<string, StoredCookie>();
  constructor(private readonly app: FastifyInstance) {}

  /** Sends a request with the cookies this browser holds and stores any cookies in the answer. */
  async request(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    const cookieHeader = [...this.cookies.entries()]
      .filter(([, cookie]) => url.startsWith(cookie.path))
      .map(([name, cookie]) => `${name}=${cookie.value}`)
      .join('; ');
    const response = await this.app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { ...unsafeRequestHeaders, ...(cookieHeader ? { cookie: cookieHeader } : {}), ...extraHeaders },
    });
    this.storeCookies(response);
    return response;
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, payload?: unknown) => this.request('POST', url, payload ?? {});
  patch = (url: string, payload: unknown) => this.request('PATCH', url, payload);

  /** Sets or replaces a cookie directly, like a person editing it in the developer tools. */
  setCookie(name: string, value: string, path = '/') {
    this.cookies.set(name, { value, path });
  }

  private storeCookies(response: LightMyRequestResponse) {
    for (const cookie of response.cookies) {
      const hasEnded =
        cookie.value === '' ||
        (cookie.maxAge !== undefined && cookie.maxAge <= 0) ||
        (cookie.expires && cookie.expires.getTime() < Date.now());
      if (hasEnded) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, { value: cookie.value, path: cookie.path ?? '/' });
    }
  }
}

/** An email address no other test uses. */
export const uniqueEmail = () => `person-${randomUUID().slice(0, 8)}@example.com`;

/** A sign-up request that is valid, with an email and business name of our own. */
export function validSignUp(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Anita Nair',
    businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
    email: uniqueEmail(),
    mobile: '+91 98470 12345',
    password: 'river-lamp-kettle-42',
    industry: 'hotel_resort',
    ...overrides,
  };
}
