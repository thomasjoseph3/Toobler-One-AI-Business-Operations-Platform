import { describe, expect, it } from 'vitest';
import { createGooglePlacesProvider, readPlaceFromGoogleAnswer } from './places-provider';

const GOOGLE_ANSWER = {
  places: [
    {
      displayName: { text: 'Nair Stays', languageCode: 'en' },
      formattedAddress: 'Beach Road, Kovalam, Kerala 695527, India',
      internationalPhoneNumber: '+91 98470 12345',
      websiteUri: 'https://nairstays.example/',
      regularOpeningHours: {
        periods: [
          { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 30 } },
          { open: { day: 2, hour: 9 }, close: { day: 2, hour: 18 } },
        ],
      },
    },
  ],
};

describe('readPlaceFromGoogleAnswer', () => {
  it('reads the name, address, phone, website and opening periods', () => {
    expect(readPlaceFromGoogleAnswer(GOOGLE_ANSWER)).toEqual({
      name: 'Nair Stays',
      address: 'Beach Road, Kovalam, Kerala 695527, India',
      phone: '+91 98470 12345',
      websiteUrl: 'https://nairstays.example/',
      openingPeriods: [
        { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 30 } },
        { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
      ],
    });
  });

  it('gives null when Google found nothing, and copes with missing parts', () => {
    expect(readPlaceFromGoogleAnswer({})).toBeNull();
    expect(readPlaceFromGoogleAnswer({ places: [] })).toBeNull();
    expect(readPlaceFromGoogleAnswer(null)).toBeNull();
    expect(readPlaceFromGoogleAnswer({ places: [{ displayName: { text: ' ' } }] })).toEqual({
      name: null,
      address: null,
      phone: null,
      websiteUrl: null,
      openingPeriods: [],
    });
  });
});

describe('createGooglePlacesProvider', () => {
  it('asks Google with the key and only the fields it needs, and reads the answer', async () => {
    let seen: { address: string; headers: Record<string, string>; body: string } | undefined;
    const provider = createGooglePlacesProvider({
      apiKey: 'test-key',
      fetchFunction: (async (address: string, init: RequestInit) => {
        seen = { address, headers: init.headers as Record<string, string>, body: String(init.body) };
        return new Response(JSON.stringify(GOOGLE_ANSWER), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const place = await provider.findPlace('Nair Stays Kovalam');
    expect(place?.name).toBe('Nair Stays');
    expect(seen?.address).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(seen?.headers['x-goog-api-key']).toBe('test-key');
    expect(seen?.headers['x-goog-fieldmask']).toContain('places.regularOpeningHours');
    expect(JSON.parse(seen!.body)).toEqual({ textQuery: 'Nair Stays Kovalam' });
  });

  it('turns every failure into a plain message that never holds the key', async () => {
    for (const status of [401, 403, 500]) {
      const provider = createGooglePlacesProvider({
        apiKey: 'secret-key-value',
        fetchFunction: (async () =>
          new Response('{"error":"secret-key-value is bad"}', { status })) as unknown as typeof fetch,
      });
      const error = await provider.findPlace('x').catch((caught: Error) => caught);
      expect(error).toMatchObject({ code: 'GOOGLE_LISTING_UNAVAILABLE' });
      expect(String((error as Error).message)).not.toContain('secret-key-value');
    }
    const unreachable = createGooglePlacesProvider({
      apiKey: 'k',
      fetchFunction: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    await expect(unreachable.findPlace('x')).rejects.toMatchObject({ code: 'GOOGLE_LISTING_UNAVAILABLE' });
  });
});
