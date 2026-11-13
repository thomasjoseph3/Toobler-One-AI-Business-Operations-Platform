import { MAX_USAGE_DAYS } from '@toobler-one/shared';

// Pure sums and dates for the AI usage numbers. Days are UTC days written like 2026-11-13.

/** The day as text: 2026-11-13. */
export function toDayText(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** The first day of the month the moment falls in (UTC), as text. */
export function firstDayOfMonthText(moment: Date): string {
  return `${moment.toISOString().slice(0, 7)}-01`;
}

/** The share of input tokens the provider served from its cache, 0 to 1, to four places. 0 when there were no input tokens. */
export function cacheHitRate(cachedTokens: number, inputTokens: number): number {
  if (inputTokens <= 0) return 0;
  return Math.round((cachedTokens / inputTokens) * 10_000) / 10_000;
}

/** Whole days from the first day to the last, both included. */
function daysBetweenInclusive(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Whether the text is a real calendar day (2026-02-31 is not). */
function isRealDay(dayText: string): boolean {
  const moment = new Date(`${dayText}T00:00:00Z`);
  return !Number.isNaN(moment.getTime()) && toDayText(moment) === dayText;
}

/**
 * The range a usage question covers: what was asked, or this month so far. Returns the range, or a plain-English problem when
 * it is not a real day, ends before it starts, or is longer than a year.
 */
export function chooseUsageRange(
  asked: { from?: string | undefined; to?: string | undefined },
  now: Date,
): { from: string; to: string } | { problem: string } {
  const from = asked.from ?? firstDayOfMonthText(now);
  const to = asked.to ?? toDayText(now);
  if (!isRealDay(from) || !isRealDay(to)) return { problem: 'from and to must be real days like 2026-11-13' };
  if (to < from) return { problem: 'to cannot be before from' };
  if (daysBetweenInclusive(from, to) > MAX_USAGE_DAYS) {
    return { problem: `A usage question can cover at most ${MAX_USAGE_DAYS} days` };
  }
  return { from, to };
}
