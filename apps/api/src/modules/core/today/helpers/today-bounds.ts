// Where "today", "this week" and "last closing time" fall for a business, in its own time zone (not in UTC). Pure
// functions (no database, no clock): each takes the moment and the zone, so every boundary can be tested on its own.
// The Today service calls these once and passes the results into the pure section logic (today-sections.ts).

/** How many minutes the zone is ahead of UTC at this moment (Asia/Kolkata is +330), following the zone's rules (handles daylight saving). */
function zoneOffsetMinutes(moment: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(moment);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const localAsIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  return Math.round((localAsIfUtc - Math.floor(moment.getTime() / 1000) * 1000) / 60_000);
}

/** The moment (UTC) that the calendar day containing `moment` starts in the zone: its local midnight. */
export function startOfDayInZone(moment: Date, timeZone: string): Date {
  const offsetNow = zoneOffsetMinutes(moment, timeZone);
  const localNow = new Date(moment.getTime() + offsetNow * 60_000);
  const localMidnightAsIfUtc = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
  // The offset at midnight can differ from the offset now (a daylight-saving change in between), so look it up again at the guess.
  const guess = new Date(localMidnightAsIfUtc - offsetNow * 60_000);
  const offsetAtMidnight = zoneOffsetMinutes(guess, timeZone);
  return new Date(localMidnightAsIfUtc - offsetAtMidnight * 60_000);
}

/** The moment (UTC) the next calendar day starts in the zone (the end of today, exclusive). */
export function startOfNextDayInZone(moment: Date, timeZone: string): Date {
  // 36 hours after the start of today is always inside tomorrow, whatever a daylight-saving change did to today's length.
  const insideTomorrow = new Date(startOfDayInZone(moment, timeZone).getTime() + 36 * 3_600_000);
  return startOfDayInZone(insideTomorrow, timeZone);
}

/** The moment (UTC) this week started in the zone: local midnight of the most recent Monday (weeks run Monday to Sunday). */
export function startOfWeekInZone(moment: Date, timeZone: string): Date {
  const startOfToday = startOfDayInZone(moment, timeZone);
  // What local weekday today is (0 = Sunday ... 6 = Saturday), read in the zone.
  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(startOfToday);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  // Days back to Monday: Monday is 0 back, Sunday (index 0) is 6 back.
  const daysSinceMonday = (weekdayIndex + 6) % 7;
  // Step back a few days, then snap to that day's local midnight (so a daylight-saving change inside the week is handled).
  const insideMonday = new Date(startOfToday.getTime() - daysSinceMonday * 24 * 3_600_000 + 12 * 3_600_000);
  return startOfDayInZone(insideMonday, timeZone);
}

/**
 * The most recent closing time (UTC) before or at `moment`, in the zone. Closing is `closingHour` local (18:00 by
 * default, until F23 adds each business's real office hours): if it is already past closing today, that is today's
 * closing; otherwise it is yesterday's. Leads that came in after this "came in overnight".
 */
export function lastClosingTimeInZone(moment: Date, timeZone: string, closingHour: number): Date {
  const closingToday = new Date(startOfDayInZone(moment, timeZone).getTime() + closingHour * 3_600_000);
  if (closingToday.getTime() <= moment.getTime()) return closingToday;
  // Before today's closing: the last closing was yesterday. Snap to yesterday's local midnight first, then add the hour.
  const insideYesterday = new Date(startOfDayInZone(moment, timeZone).getTime() - 12 * 3_600_000);
  return new Date(startOfDayInZone(insideYesterday, timeZone).getTime() + closingHour * 3_600_000);
}

/** The closing hour used until F23 gives each business its own office hours (18:00, business-local). */
export const DEFAULT_CLOSING_HOUR = 18;
