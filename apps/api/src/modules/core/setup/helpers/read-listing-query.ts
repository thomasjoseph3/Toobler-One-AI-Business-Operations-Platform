import { ApiError } from '../../../../kernel/errors';

// Turns what the owner typed for "Are you on Google Maps?" into the text Google is asked to search for. Pure: no network.
// A link is never fetched: only the business's name inside a long Google Maps link is read from the link's own text. A short link
// (maps.app.goo.gl) would have to be followed to find the name, which we do not do for an address someone typed.

const NOT_SUPPORTED_MESSAGE =
  'Paste the business name with its town (like "Nair Stays Kovalam"), or the long link from the address bar of Google Maps.';

/** The text to search Google for. 400 `LISTING_NOT_SUPPORTED` when it is a link we cannot read the name from. */
export function readListingSearchText(typedListing: string): string {
  const text = typedListing.trim().replace(/\s+/g, ' ');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;

  let link: URL;
  try {
    link = new URL(text);
  } catch {
    throw new ApiError(400, 'LISTING_NOT_SUPPORTED', NOT_SUPPORTED_MESSAGE);
  }
  const isGoogleMapsLink = /^(www\.)?google\.[a-z.]+$/i.test(link.hostname) && link.pathname.startsWith('/maps/place/');
  if (!isGoogleMapsLink || !['http:', 'https:'].includes(link.protocol)) {
    throw new ApiError(400, 'LISTING_NOT_SUPPORTED', NOT_SUPPORTED_MESSAGE);
  }
  const nameInLink = link.pathname.split('/')[3] ?? '';
  let name: string;
  try {
    name = decodeURIComponent(nameInLink.replace(/\+/g, ' ')).trim();
  } catch {
    throw new ApiError(400, 'LISTING_NOT_SUPPORTED', NOT_SUPPORTED_MESSAGE);
  }
  if (name.length < 2) throw new ApiError(400, 'LISTING_NOT_SUPPORTED', NOT_SUPPORTED_MESSAGE);
  return name.slice(0, 200);
}
