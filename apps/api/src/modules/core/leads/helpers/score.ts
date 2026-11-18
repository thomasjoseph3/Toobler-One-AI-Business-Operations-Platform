// Lead scoring (F10): the temperature of a lead and the reason for it, worked out by fixed rules from facts the AI recorded. The same facts always
// give the same answer. Pure: no database, no clock (today's date is passed in).

/** The facts the score is made from. */
export interface LeadScoreFacts {
  /** The person asked to book, or for a payment link. */
  askedToBook: boolean;
  /** The person asked what it costs. */
  askedPrice: boolean;
  /** The first day they gave, as a plain date like 2026-12-12, or null. */
  dateFrom: string | null;
  /** The last day they gave, or null. */
  dateTo: string | null;
  /** Today's date in the business's time zone, as a plain date. */
  today: string;
}

export interface LeadScore {
  temperature: 'hot' | 'warm' | 'cold';
  /** One short sentence for the card: "Dates 12–15 Dec and asked the price". */
  reason: string;
}

/** How soon the dates must be for "within 30 days". */
export const HOT_DATES_WITHIN_DAYS = 30;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The number of whole days from one plain date to another (negative when `to` is earlier). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MILLISECONDS_PER_DAY);
}

/** Writes the dates as people say them: "12 Dec", "12–15 Dec", "28 Nov – 2 Dec", or "12 Dec 2026 – 3 Jan 2027" across years. */
export function describeDates(dateFrom: string, dateTo: string | null): string {
  const [fromYear, fromMonth, fromDay] = dateFrom.split('-').map(Number) as [number, number, number];
  const fromText = `${fromDay} ${MONTH_NAMES[fromMonth - 1]}`;
  if (dateTo === null || dateTo === dateFrom) return fromText;
  const [toYear, toMonth, toDay] = dateTo.split('-').map(Number) as [number, number, number];
  const toText = `${toDay} ${MONTH_NAMES[toMonth - 1]}`;
  if (fromYear !== toYear) return `${fromText} ${fromYear} – ${toText} ${toYear}`;
  if (fromMonth === toMonth) return `${fromDay}–${toDay} ${MONTH_NAMES[fromMonth - 1]}`;
  return `${fromText} – ${toText}`;
}

/**
 * Scores a lead. Hot: asked to book, or gave dates within 30 days and asked the price. Warm: gave dates, or asked the price. Cold: only general
 * questions. Dates already past do not count as "within 30 days", and a start date with no end counts as one day.
 */
export function scoreLead(facts: LeadScoreFacts): LeadScore {
  if (facts.askedToBook) return { temperature: 'hot', reason: 'Asked to book' };

  const hasDates = facts.dateFrom !== null;
  const daysUntilDates = facts.dateFrom === null ? null : daysBetween(facts.today, facts.dateFrom);
  const datesAreSoon = daysUntilDates !== null && daysUntilDates >= 0 && daysUntilDates <= HOT_DATES_WITHIN_DAYS;
  const datesText = facts.dateFrom === null ? '' : describeDates(facts.dateFrom, facts.dateTo);

  if (datesAreSoon && facts.askedPrice) {
    return {
      temperature: 'hot',
      reason: `Dates ${datesText} (within ${HOT_DATES_WITHIN_DAYS} days) and asked the price`,
    };
  }
  if (hasDates && facts.askedPrice) return { temperature: 'warm', reason: `Dates ${datesText} and asked the price` };
  if (hasDates) return { temperature: 'warm', reason: `Gave dates ${datesText}` };
  if (facts.askedPrice) return { temperature: 'warm', reason: 'Asked the price' };
  return { temperature: 'cold', reason: 'Only general questions so far' };
}
