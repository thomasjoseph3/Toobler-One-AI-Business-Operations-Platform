// The websites a business lets its chat bubble appear on. A browser says which website a request comes from in its `Origin` header, written
// as scheme, host and port with no page (`https://nairstays.example`). A business types its site however it likes; this turns that into
// exactly that form, or says what is wrong. Pure: no database.

/** What came of one typed website: its origin, or what is wrong with it in words the business can act on. */
export type WebsiteOriginResult = { ok: true; origin: string } | { ok: false; problem: string };

/**
 * Reads one typed website. Only http and https sites are allowed; a page after the address ("/contact") and a wildcard ("*") are
 * refused, so a business never lists more than it means to. The answer is lower case, with the port only when it is not the usual one.
 */
export function readWebsiteOrigin(typed: string): WebsiteOriginResult {
  const text = typed.trim();
  if (text.includes('*'))
    return { ok: false, problem: `"${text}": wildcards are not allowed. List each website by its full address.` };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, problem: `"${text}" is not a website address. Write it like https://nairstays.example` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, problem: `"${text}": use an address that starts with https:// (or http://).` };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, problem: `"${text}": leave out any user name or password.` };
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '') {
    return { ok: false, problem: `"${text}": give the website's address without a page, like ${url.origin}` };
  }
  return { ok: true, origin: url.origin };
}

/** Reads a whole list. Each website once, in the order given. The first problem is reported. */
export function readWebsiteOrigins(
  typedList: readonly string[],
): { ok: true; origins: string[] } | { ok: false; problem: string } {
  const origins: string[] = [];
  for (const typed of typedList) {
    const result = readWebsiteOrigin(typed);
    if (!result.ok) return result;
    if (!origins.includes(result.origin)) origins.push(result.origin);
  }
  return { ok: true, origins };
}

/** True when a request's `Origin` is one of the allowed websites. A missing Origin is never allowed. */
export function isWebsiteAllowed(requestOrigin: string | undefined, allowedWebsites: readonly string[]): boolean {
  if (!requestOrigin) return false;
  return allowedWebsites.includes(requestOrigin);
}
