import { ApiError } from '../../kernel/errors';

// Reads a business's Google listing through the Google Places (New) API. Only the setup wizard uses it. The address called is fixed
// (places.googleapis.com), never one the owner typed, so it cannot be turned against our own network. Without a key it is off.

/** One opening period in Google's words: day 0 is Sunday. A period with no `close` is open round the clock. */
export interface PlaceOpeningPeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

/** What Google knows about a place. Every part may be missing. */
export interface PlaceDetails {
  name: string | null;
  address: string | null;
  phone: string | null;
  websiteUrl: string | null;
  openingPeriods: PlaceOpeningPeriod[];
}

export interface PlacesProvider {
  /** The best match for a text like "Nair Stays Kovalam", or null when Google finds nothing. */
  findPlace(searchText: string): Promise<PlaceDetails | null>;
}

const SEARCH_ADDRESS = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS_TO_ASK_FOR = [
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours',
].join(',');
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

/** Reads the first place out of Google's answer. Exported for tests. */
export function readPlaceFromGoogleAnswer(answer: unknown): PlaceDetails | null {
  const places = (answer as { places?: unknown })?.places;
  const place = Array.isArray(places) ? (places[0] as Record<string, unknown> | undefined) : undefined;
  if (!place) return null;
  const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const periods = (place['regularOpeningHours'] as { periods?: unknown } | undefined)?.periods;
  const openingPeriods: PlaceOpeningPeriod[] = [];
  for (const period of Array.isArray(periods) ? periods : []) {
    const open = (period as { open?: Record<string, unknown> }).open;
    const close = (period as { close?: Record<string, unknown> }).close;
    if (!open || typeof open['day'] !== 'number') continue;
    const readPoint = (point: Record<string, unknown>) => ({
      day: Number(point['day']),
      hour: Number(point['hour'] ?? 0),
      minute: Number(point['minute'] ?? 0),
    });
    openingPeriods.push({ open: readPoint(open), ...(close ? { close: readPoint(close) } : {}) });
  }
  return {
    name: text((place['displayName'] as { text?: unknown } | undefined)?.text),
    address: text(place['formattedAddress']),
    phone: text(place['internationalPhoneNumber']),
    websiteUrl: text(place['websiteUri']),
    openingPeriods,
  };
}

/** The real Google Places client. `fetchFunction` is replaceable so a test can answer without the internet. */
export function createGooglePlacesProvider(options: { apiKey: string; fetchFunction?: typeof fetch }): PlacesProvider {
  const fetchFunction = options.fetchFunction ?? fetch;
  return {
    async findPlace(searchText) {
      let response: Response;
      try {
        response = await fetchFunction(SEARCH_ADDRESS, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': options.apiKey,
            'x-goog-fieldmask': FIELDS_TO_ASK_FOR,
          },
          body: JSON.stringify({ textQuery: searchText }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
        });
      } catch {
        throw new ApiError(502, 'GOOGLE_LISTING_UNAVAILABLE', 'Google could not be reached just now.');
      }
      if (response.status === 401 || response.status === 403) {
        // The key is ours: say it is not working without saying anything about it
        throw new ApiError(502, 'GOOGLE_LISTING_UNAVAILABLE', 'Reading Google listings is not working right now.');
      }
      if (!response.ok) throw new ApiError(502, 'GOOGLE_LISTING_UNAVAILABLE', 'Google could not be reached just now.');
      return readPlaceFromGoogleAnswer(await response.json());
    },
  };
}

/** A stand-in for tests: answers from a function, never calls Google. */
export function createScriptedPlacesProvider(script: (searchText: string) => PlaceDetails | null): PlacesProvider {
  return { findPlace: async (searchText) => script(searchText) };
}
