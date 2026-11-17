import { decodeHtmlCharacters } from './html-to-text';
import type { PageLink } from './read-html-page';

// Which pages of a website are worth reading, and what a sitemap lists. Pure: no network. Ported from the hotel agent, with its
// hotel-only words (rooms, cottages, ayurveda) replaced by words that fit any small business.

/** How many pages besides the home page are read. */
export const MAX_EXTRA_PAGES = 7;
/** How many addresses are taken from a sitemap. */
export const MAX_SITEMAP_ADDRESSES = 500;

// Where contact details, the description, FAQs, rules and prices most often are
const MOST_USEFUL_PATTERN = /contact|reach|location|direction|find-us|about|story|faq|question|polic|terms|rules|fees|pricing|price/i;
// Pages that often list what the business sells and offers
const ALSO_USEFUL_PATTERN =
  /service|product|menu|course|class|treatment|doctor|team|package|tour|holiday|trip|room|stay|plan|offer|experience|facilit|amenit/i;
const NOT_A_PAGE_PATTERN = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3|xml|txt|js|css)$/i;
// Never about the business itself: posts, shop and account pages, and legal pages (privacy, cookies). Not terms: a business's terms page is where its house rules, ID rules and timings often are
const NOT_ABOUT_THE_BUSINESS_PATTERN =
  /\/(blog|news|posts?|articles?|tags?|category|categories|author|events?|gallery|careers?|jobs?|wp-content|wp-admin|cart|checkout|login|account|privacy|cookies?|disclaimer|gdpr|sitemap)\b/i;

// Sitemaps of blog posts, products and archives: never the business's own pages
const NOT_PAGES_SITEMAP_PATTERN = /post-sitemap|posts-post|product|categor|tag|author|taxonom|users|image|video|news/i;

const scoreWords = (text: string, mostUsefulScore: number, alsoUsefulScore: number): number =>
  MOST_USEFUL_PATTERN.test(text) ? mostUsefulScore : ALSO_USEFUL_PATTERN.test(text) ? alsoUsefulScore : 0;

/** Whether two addresses are on the same site, whether they start with www. or not. */
export function isSameSite(first: URL, second: URL): boolean {
  return first.hostname.replace(/^www\./, '') === second.hostname.replace(/^www\./, '');
}

/** One key per page, whether its link has www. or not and a trailing slash or not. */
export function pageKeyOf(address: URL): string {
  return `${address.hostname.replace(/^www\./, '')}${address.pathname.replace(/\/+$/, '')}`;
}

/** The links most worth reading (from the home page, then the sitemap), best first: one per page, never the home page itself. */
export function choosePagesWorthReading(homeAddress: string, links: readonly PageLink[], maximumPages = MAX_EXTRA_PAGES): string[] {
  const home = new URL(homeAddress);
  const alreadyChosen = new Set([pageKeyOf(home)]);
  const chosen: Array<{ address: string; score: number }> = [];
  // An address inside a site (one branch of a group: example.com/kochi) is read within that part of the site
  const homeFolder = home.pathname.replace(/\/[^/]*\.[a-z0-9]+$/i, '').replace(/\/+$/, '');
  const isInsideHomeFolder = (candidate: URL) =>
    !homeFolder || candidate.pathname === homeFolder || candidate.pathname.startsWith(`${homeFolder}/`);

  for (const { url, label } of links) {
    let candidate: URL;
    try {
      candidate = new URL(url);
    } catch {
      continue;
    }
    candidate.hash = '';
    const key = pageKeyOf(candidate);
    if (
      !/^https?:$/.test(candidate.protocol) ||
      !isSameSite(candidate, home) ||
      !isInsideHomeFolder(candidate) ||
      alreadyChosen.has(key) ||
      NOT_A_PAGE_PATTERN.test(candidate.pathname) ||
      NOT_ABOUT_THE_BUSINESS_PATTERN.test(candidate.pathname)
    ) {
      continue;
    }
    // A page deeper in the site (a trip, an article) is less likely to be about the business than /contact or /about
    const depth = candidate.pathname.slice(homeFolder.length).split('/').filter(Boolean).length;
    const score = scoreWords(candidate.pathname, 4, 2) + scoreWords(label, 2, 1) - 2 * Math.max(0, depth - 1);
    if (score <= 0) continue;
    alreadyChosen.add(key);
    chosen.push({ address: candidate.href, score });
  }
  return chosen
    .sort((first, second) => second.score - first.score)
    .slice(0, maximumPages)
    .map((page) => page.address);
}

/** The addresses a sitemap (or sitemap index) lists. */
export function readSitemapAddresses(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/gi)].map((match) => decodeHtmlCharacters(match[1] ?? ''));
}

/** Whether a sitemap listed inside a sitemap index may hold the business's own pages (not posts, products or archives). */
export function isSitemapOfBusinessPages(sitemapAddress: string): boolean {
  return !NOT_PAGES_SITEMAP_PATTERN.test(sitemapAddress);
}
