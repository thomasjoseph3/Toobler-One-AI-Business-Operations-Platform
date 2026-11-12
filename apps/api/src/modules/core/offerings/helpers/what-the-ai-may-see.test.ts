import { describe, expect, it } from 'vitest';
import { selectWhatTheAgentMaySee } from './what-the-ai-may-see';

const now = new Date('2026-11-12T10:00:00Z');

/** An offering with sensible defaults; each test changes only what it is about. */
function offering(overrides: Partial<Parameters<typeof selectWhatTheAgentMaySee>[0]['offerings'][number]> = {}) {
  return {
    name: 'Family room',
    description: 'Two beds, sea view',
    fromPricePaise: 450_000,
    priceUnit: 'per night',
    gstMode: 'plus' as const,
    seasonNote: 'Higher in December and January',
    includes: 'Breakfast for four',
    details: [{ label: 'Check-in', value: '2 PM' }],
    active: true,
    deleted: false,
    sort: 0,
    ...overrides,
  };
}

describe('selectWhatTheAgentMaySee', () => {
  it('gives an active offering with its price in words and everything the AI may say', () => {
    const seen = selectWhatTheAgentMaySee({ offerings: [offering()], offers: [], now, timeZone: 'Asia/Kolkata' });
    expect(seen.offerings).toEqual([
      {
        name: 'Family room',
        description: 'Two beds, sea view',
        priceInWords: 'from ₹4,500 a night plus GST',
        seasonNote: 'Higher in December and January',
        includes: 'Breakfast for four',
        details: [{ label: 'Check-in', value: '2 PM' }],
      },
    ]);
  });

  it('never shows an offering that is switched off or removed', () => {
    const seen = selectWhatTheAgentMaySee({
      offerings: [
        offering({ name: 'On' }),
        offering({ name: 'Off', active: false }),
        offering({ name: 'Removed', deleted: true }),
        offering({ name: 'Off and removed', active: false, deleted: true }),
      ],
      offers: [],
      now,
      timeZone: 'Asia/Kolkata',
    });
    expect(seen.offerings.map((item) => item.name)).toEqual(['On']);
  });

  it("keeps the owner's order, and gives no price for an offering that does not share one", () => {
    const seen = selectWhatTheAgentMaySee({
      offerings: [
        offering({ name: 'Third', sort: 2 }),
        offering({ name: 'First', sort: 0, fromPricePaise: null, priceUnit: null, gstMode: null }),
        offering({ name: 'Second', sort: 1 }),
      ],
      offers: [],
      now,
      timeZone: 'Asia/Kolkata',
    });
    expect(seen.offerings.map((item) => item.name)).toEqual(['First', 'Second', 'Third']);
    expect(seen.offerings[0]!.priceInWords).toBeNull();
  });

  it('never shows an offer past its end date or removed, and shows the ones ending soonest first', () => {
    const seen = selectWhatTheAgentMaySee({
      offerings: [],
      offers: [
        { text: 'Christmas week', endsOn: '2026-12-31', deleted: false },
        { text: 'Ended yesterday', endsOn: '2026-11-11', deleted: false },
        { text: 'Removed', endsOn: '2026-12-01', deleted: true },
        { text: 'This weekend', endsOn: '2026-11-15', deleted: false },
        { text: 'Ends today', endsOn: '2026-11-12', deleted: false },
      ],
      now,
      timeZone: 'Asia/Kolkata',
    });
    expect(seen.offers.map((offer) => offer.text)).toEqual(['Ends today', 'This weekend', 'Christmas week']);
  });

  it('uses the business\'s time zone for "ended": an offer ending today is gone once it is tomorrow where the business is', () => {
    const lateInTheEvening = new Date('2026-11-12T19:00:00Z'); // the 13th in India
    const offers = [{ text: 'Ends on the 12th', endsOn: '2026-11-12', deleted: false }];
    expect(
      selectWhatTheAgentMaySee({ offerings: [], offers, now: lateInTheEvening, timeZone: 'Asia/Kolkata' }).offers,
    ).toEqual([]);
    expect(
      selectWhatTheAgentMaySee({ offerings: [], offers, now: lateInTheEvening, timeZone: 'Europe/London' }).offers,
    ).toHaveLength(1);
  });

  it('gives nothing for a business with nothing, and does not change what it is given', () => {
    expect(selectWhatTheAgentMaySee({ offerings: [], offers: [], now, timeZone: 'Asia/Kolkata' })).toEqual({
      offerings: [],
      offers: [],
    });
    const given = [offering({ name: 'B', sort: 1 }), offering({ name: 'A', sort: 0 })];
    selectWhatTheAgentMaySee({ offerings: given, offers: [], now, timeZone: 'Asia/Kolkata' });
    expect(given.map((item) => item.name)).toEqual(['B', 'A']);
  });
});
