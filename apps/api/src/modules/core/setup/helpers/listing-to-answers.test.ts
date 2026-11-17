import { describe, expect, it } from 'vitest';
import { listingToAnswers, openingPeriodsToHours } from './listing-to-answers';

const period = (day: number, openHour: number, closeHour: number, closeDay = day) => ({
  open: { day, hour: openHour, minute: 0 },
  close: { day: closeDay, hour: closeHour, minute: 30 },
});

describe('openingPeriodsToHours', () => {
  it('writes one opening and closing time per day, Sunday as sun', () => {
    expect(openingPeriodsToHours([period(1, 9, 18), period(0, 10, 14)])).toEqual({
      days: { mon: { open: '09:00', close: '18:30' }, sun: { open: '10:00', close: '14:30' } },
    });
  });

  it('says open all day for a place open round the clock', () => {
    expect(openingPeriodsToHours([{ open: { day: 0, hour: 0, minute: 0 } }])).toEqual({ allDay: true });
  });

  it('gives nothing rather than a wrong answer: a lunch break, past midnight, or no periods', () => {
    expect(openingPeriodsToHours([period(1, 9, 13), period(1, 14, 18)])).toBeNull();
    expect(openingPeriodsToHours([period(5, 18, 2, 6)])).toBeNull();
    expect(openingPeriodsToHours([])).toBeNull();
    expect(openingPeriodsToHours([{ open: { day: 1, hour: 9, minute: 0 } }])).toBeNull();
  });
});

describe('listingToAnswers', () => {
  it('gives the name, address, phone and hours Google has', () => {
    const answers = listingToAnswers({
      name: 'Nair Stays',
      address: 'Beach Road, Kovalam',
      phone: '+91 98470 12345',
      websiteUrl: null,
      openingPeriods: [period(1, 9, 18)],
    });
    expect(answers.map((answer) => answer.questionKey)).toEqual(['business_name', 'address', 'contact_details', 'opening_hours']);
    expect(answers[2]!.value).toEqual({ rows: [{ kind: 'Phone', value: '+91 98470 12345' }] });
  });

  it('gives nothing for what Google does not have', () => {
    expect(listingToAnswers({ name: null, address: null, phone: null, websiteUrl: null, openingPeriods: [] })).toEqual([]);
  });
});
