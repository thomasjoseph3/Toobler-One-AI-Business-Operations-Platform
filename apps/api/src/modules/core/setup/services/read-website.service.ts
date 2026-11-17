import {
  choosePagesWorthReading,
  isSameSite,
  isSitemapOfBusinessPages,
  MAX_SITEMAP_ADDRESSES,
  pageKeyOf,
  readSitemapAddresses,
} from '../helpers/choose-pages-to-read';
import { readHtmlPage, type PageLink, type StructuredBusinessFacts } from '../helpers/read-html-page';
import type { WebPageFetcher } from './fetch-web-page.service';

// Reads a business's own website as text for the AI: the home page, then the few pages most likely to describe it (contact,
// about, FAQ, prices), found from the home page's links and the site's sitemap. Pure logic around an injected fetcher, so tests
// use made-up pages instead of the internet. Ported from the hotel agent's fetchSite.js.

/** How long finding the sitemap may take before the home page's own links are used alone. */
const SITEMAP_TIMEOUT_MILLISECONDS = 8_000;
/** The most sitemap files followed from a sitemap index, and the most candidate sitemap addresses tried. */
const MAXIMUM_CHILD_SITEMAPS = 3;
const MAXIMUM_SITEMAP_CANDIDATES = 4;

export interface WebsiteText {
  /** Each page's address and its text, the home page first. */
  pages: Array<{ url: string; text: string }>;
  phones: string[];
  emails: string[];
  mapLinks: string[];
  /** What the pages state for search engines about the business, the home page's first. */
  facts: StructuredBusinessFacts;
}

/** `promise`, or `fallback` when it takes longer than the time given. */
function withinTime<Value>(promise: Promise<Value>, milliseconds: number, fallback: Value): Promise<Value> {
  return Promise.race([
    promise,
    new Promise<Value>((resolve) => setTimeout(() => resolve(fallback), milliseconds).unref?.()),
  ]);
}

/** The pages a site's sitemap lists, found through robots.txt or the usual addresses (one level of sitemap index). Empty when there is none. */
async function findSitemapPages(homeAddress: string, fetchWebPage: WebPageFetcher): Promise<string[]> {
  const home = new URL(homeAddress);
  const alreadyTried = new Set<string>();
  const fetchText = async (address: string): Promise<string | null> => {
    if (alreadyTried.has(address)) return null;
    alreadyTried.add(address);
    try {
      return (await fetchWebPage(address, { kind: 'text' })).body;
    } catch {
      return null; // a missing sitemap is normal
    }
  };
  const isOnOwnSite = (address: string): boolean => {
    try {
      return isSameSite(new URL(address), home);
    } catch {
      return false;
    }
  };

  const robotsText = await fetchText(`${home.origin}/robots.txt`);
  const listedInRobots = robotsText ? [...robotsText.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((match) => match[1]!) : [];
  const candidates = [
    ...listedInRobots,
    `${home.origin}/sitemap.xml`,
    `${home.origin}/sitemap_index.xml`,
    `${home.origin}/wp-sitemap.xml`,
  ];
  for (const candidate of [...new Set(candidates)].filter(isOnOwnSite).slice(0, MAXIMUM_SITEMAP_CANDIDATES)) {
    const xml = await fetchText(candidate);
    if (!xml || !/<(urlset|sitemapindex)\b/i.test(xml)) continue;
    if (!/<sitemapindex\b/i.test(xml)) {
      return readSitemapAddresses(xml).filter(isOnOwnSite).slice(0, MAX_SITEMAP_ADDRESSES);
    }
    const childSitemaps = readSitemapAddresses(xml)
      .filter((address) => isOnOwnSite(address) && isSitemapOfBusinessPages(address))
      .slice(0, MAXIMUM_CHILD_SITEMAPS);
    const childDocuments = await Promise.all(childSitemaps.map(fetchText));
    return childDocuments
      .filter((document): document is string => document !== null)
      .flatMap(readSitemapAddresses)
      .filter(isOnOwnSite)
      .slice(0, MAX_SITEMAP_ADDRESSES);
  }
  return [];
}

/** Makes the website reader around a page fetcher. */
export function createWebsiteReader({ fetchWebPage }: { fetchWebPage: WebPageFetcher }) {
  return {
    /**
     * The website as the AI reads it: the home page, then the pages most worth reading from its links and its sitemap (any
     * that fail are skipped). The typed address is checked and fetched by `fetchWebPage`, so every safety rule applies; a bad
     * home page throws that fetcher's 400.
     */
    async readWebsite(typedAddress: string): Promise<WebsiteText> {
      const homePage = await fetchWebPage(typedAddress);
      const readHome = readHtmlPage(homePage.body, homePage.url);
      const sitemapAddresses = await withinTime(findSitemapPages(homePage.url, fetchWebPage), SITEMAP_TIMEOUT_MILLISECONDS, []);
      const candidateLinks: PageLink[] = [
        ...readHome.links,
        ...sitemapAddresses.map((address) => ({ url: address, label: '' })),
      ];
      const otherPages = await Promise.allSettled(
        choosePagesWorthReading(homePage.url, candidateLinks).map((address) => fetchWebPage(address)),
      );
      const readPages = [
        { url: homePage.url, ...readHome },
        ...otherPages.flatMap((result) =>
          result.status === 'fulfilled' ? [{ url: result.value.url, ...readHtmlPage(result.value.body, result.value.url) }] : [],
        ),
      ].filter(
        // A link that redirected to a page already read is read once
        (page, position, all) => all.findIndex((other) => pageKeyOf(new URL(other.url)) === pageKeyOf(new URL(page.url))) === position,
      );
      return {
        pages: readPages.map((page) => ({ url: page.url, text: page.text })),
        phones: [...new Set(readPages.flatMap((page) => page.phones))],
        emails: [...new Set(readPages.flatMap((page) => page.emails))],
        mapLinks: [...new Set(readPages.flatMap((page) => page.mapLinks))],
        // The home page's facts first: a field another page gives too keeps the first
        facts: readPages.reduce<StructuredBusinessFacts>((all, page) => ({ ...page.facts, ...all }), {}),
      };
    },
  };
}

export type WebsiteReader = ReturnType<typeof createWebsiteReader>;
export { SITEMAP_TIMEOUT_MILLISECONDS };
