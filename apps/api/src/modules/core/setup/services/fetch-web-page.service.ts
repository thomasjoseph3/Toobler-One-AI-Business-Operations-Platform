import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import zlib from 'node:zlib';
import { ApiError } from '../../../../kernel/errors';
import { isPublicAddress, notAPublicWebsite, parseWebsiteAddress, STANDARD_WEB_PORTS } from '../helpers/public-address';

// Fetches one public web page safely. The server fetches an address someone typed, so it must never be turned against our own
// network: only http(s) on the standard ports, only public addresses (checked on the address actually connected to, so a name
// that resolves to a private address, or changes to one between checks, is refused), a few redirects each checked the same way,
// a time limit and a size limit. Ported from the hotel agent's fetchSite.js (docs/SECURITY.md, SSRF).

const PAGE_TIMEOUT_MILLISECONDS = 10_000;
// Some site builders put megabytes of styles in the page itself, with the text after it: read that far
const MAXIMUM_PAGE_BYTES = 10_000_000;
const MAXIMUM_REDIRECTS = 4;
const USER_AGENT = 'Mozilla/5.0 (compatible; ToblerOneSetup/1.0; reads a business website it was asked to set up)';

/** What each kind of fetch accepts: a web page, or a plain text or XML file (robots.txt, a sitemap). */
const FETCH_KINDS = {
  html: { accept: 'text/html,application/xhtml+xml', contentType: /html/i },
  text: { accept: 'application/xml,text/xml,text/plain', contentType: /xml|text\/plain/i },
} as const;
export type FetchKind = keyof typeof FETCH_KINDS;

export interface FetchedPage {
  /** The address the page finally came from, after redirects. */
  url: string;
  body: string;
}

export type WebPageFetcher = (address: string, options?: { kind?: FetchKind }) => Promise<FetchedPage>;

export interface WebPageFetcherRules {
  /** Decides whether an address may be connected to. The default is "on the public internet"; only tests loosen it. */
  isAddressAllowed?: (address: string) => boolean;
  /** The ports that may be used. The default is 80 and 443; only tests loosen it. */
  allowedPorts?: readonly string[];
  /** How long one page may take. Tests shorten it. */
  pageTimeoutMilliseconds?: number;
  /** The most bytes read from one page. Tests shorten it. */
  maximumPageBytes?: number;
}

/**
 * The lookup the connection itself uses (so there is no second lookup an attacker could change): it refuses a name that
 * resolves to any address that is not allowed.
 */
export function createCheckedLookup(isAddressAllowed: (address: string) => boolean = isPublicAddress): net.LookupFunction {
  return (hostname, lookupOptions, callback) => {
    dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
      if (error) return callback(error, '', 4);
      if (addresses.length === 0 || addresses.some((found) => !isAddressAllowed(found.address))) {
        return callback(notAPublicWebsite() as unknown as NodeJS.ErrnoException, '', 4);
      }
      if (lookupOptions.all) return callback(null, addresses);
      return callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

interface OneResponse {
  status: number;
  redirectTo?: string;
  body?: string;
}

/** Makes one GET without following redirects. The whole page must come within the time limit. */
function getOnce(url: URL, kind: FetchKind, rules: Required<WebPageFetcherRules>): Promise<OneResponse> {
  let timer: NodeJS.Timeout | undefined;
  return new Promise<OneResponse>((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        lookup: createCheckedLookup(rules.isAddressAllowed),
        headers: {
          'user-agent': USER_AGENT,
          accept: FETCH_KINDS[kind].accept,
          'accept-encoding': 'gzip, deflate, br',
        },
        timeout: rules.pageTimeoutMilliseconds,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ status, ...(response.headers.location ? { redirectTo: response.headers.location } : {}) });
          return;
        }
        const contentType = String(response.headers['content-type'] ?? '');
        if (status !== 200 || (contentType && !FETCH_KINDS[kind].contentType.test(contentType))) {
          response.resume();
          resolve({ status });
          return;
        }
        const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip'
            ? response.pipe(zlib.createGunzip())
            : encoding === 'deflate'
              ? response.pipe(zlib.createInflate())
              : encoding === 'br'
                ? response.pipe(zlib.createBrotliDecompress())
                : response;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          if (size + chunk.length > rules.maximumPageBytes) {
            // Keep the part that fits (a first chunk can be bigger than the limit), then stop: what came in time is enough
            chunks.push(chunk.subarray(0, rules.maximumPageBytes - size));
            request.destroy();
            resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
            return;
          }
          size += chunk.length;
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        stream.on('error', reject);
      },
    );
    const stopBecauseTooSlow = () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    request.on('timeout', stopBecauseTooSlow);
    timer = setTimeout(stopBecauseTooSlow, rules.pageTimeoutMilliseconds);
    request.on('error', reject);
  }).finally(() => clearTimeout(timer));
}

/**
 * Makes the function that fetches pages. A fetch follows up to four redirects (each one checked like the first address) and
 * answers { url, body }. `kind: 'text'` reads robots.txt or a sitemap instead of a web page. Every refusal is a 400 with a
 * code (WEBSITE_NOT_PUBLIC, WEBSITE_TIMEOUT, WEBSITE_NOT_FOUND, WEBSITE_ERROR_STATUS, WEBSITE_NOT_A_PAGE,
 * WEBSITE_TOO_MANY_REDIRECTS, WEBSITE_UNREADABLE) and a plain-English message.
 */
export function createWebPageFetcher(rules: WebPageFetcherRules = {}): WebPageFetcher {
  const allRules: Required<WebPageFetcherRules> = {
    isAddressAllowed: rules.isAddressAllowed ?? isPublicAddress,
    allowedPorts: rules.allowedPorts ?? STANDARD_WEB_PORTS,
    pageTimeoutMilliseconds: rules.pageTimeoutMilliseconds ?? PAGE_TIMEOUT_MILLISECONDS,
    maximumPageBytes: rules.maximumPageBytes ?? MAXIMUM_PAGE_BYTES,
  };
  const addressRules = { allowedPorts: allRules.allowedPorts, isAddressAllowed: allRules.isAddressAllowed };

  return async (address, options = {}) => {
    const kind = options.kind ?? 'html';
    let url = parseWebsiteAddress(address, addressRules);
    for (let hop = 0; hop <= MAXIMUM_REDIRECTS; hop++) {
      let response: OneResponse;
      try {
        response = await getOnce(url, kind, allRules);
      } catch (error) {
        if (error instanceof ApiError) throw error; // ours: not a public address
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ETIMEDOUT') throw new ApiError(400, 'WEBSITE_TIMEOUT', 'The website took too long to answer.');
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
          throw new ApiError(400, 'WEBSITE_NOT_FOUND', `No website was found at ${url.hostname}.`);
        }
        throw new ApiError(400, 'WEBSITE_UNREADABLE', `The website could not be read (${code || 'connection failed'}).`);
      }
      if (response.redirectTo) {
        // Each hop is checked like the first address, so a redirect to a private address is refused
        url = parseWebsiteAddress(new URL(response.redirectTo, url).href, addressRules);
        continue;
      }
      if (response.status !== 200) {
        throw new ApiError(400, 'WEBSITE_ERROR_STATUS', `The website answered with an error (${response.status}).`);
      }
      if (response.body === undefined) throw new ApiError(400, 'WEBSITE_NOT_A_PAGE', "That address isn't a web page.");
      return { url: url.href, body: response.body };
    }
    throw new ApiError(400, 'WEBSITE_TOO_MANY_REDIRECTS', 'The website redirects too many times.');
  };
}
