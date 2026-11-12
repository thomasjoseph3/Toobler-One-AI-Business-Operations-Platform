/**
 * Today's date in a time zone, written like 2026-11-12. The same moment is a different date in different parts of the world,
 * and an offer that "ends on 12 November" ends at midnight where the business is, not in London. Pure.
 */
export function todayInTimeZone(now: Date, timeZone: string): string {
  // The "en-CA" locale writes dates as year-month-day, which is the shape we store
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * True while an offer is still on: today, in the business's time zone, is on or before its last day. Worked out when it is
 * read (never by a job), so an offer can never stay on a day too long. `endsOn` is a plain date like 2026-12-31. Pure.
 */
export function isOfferCurrent(endsOn: string, now: Date, timeZone: string): boolean {
  return todayInTimeZone(now, timeZone) <= endsOn;
}
