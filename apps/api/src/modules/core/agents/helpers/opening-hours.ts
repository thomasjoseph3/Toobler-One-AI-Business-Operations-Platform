import type { DayOfWeek, WeeklyHoursValue } from '@toobler-one/shared';

// Whether the business is open at a moment, and when it next opens, in the business's own time zone. Pure: no database, and no
// time-zone library (the platform's own Intl is enough). Times are UTC instants; hours are the clock on the wall of the business.

const DAYS_BY_NUMBER: readonly DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SEARCH_DAYS_AHEAD = 7;

/** A calendar date with no time or zone, as people write it. Month is 1 to 12. */
interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** The wall clock of a place at one moment. */
interface WallClock extends CalendarDate {
  weekday: DayOfWeek;
  minutesIntoDay: number;
}

/** What the clock on the wall of the given time zone says at this instant. */
export function readWallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const numberOf = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const date: CalendarDate = { year: numberOf('year'), month: numberOf('month'), day: numberOf('day') };
  return {
    ...date,
    weekday: weekdayOf(date),
    minutesIntoDay: numberOf('hour') * 60 + numberOf('minute'),
  };
}

/** The day of the week of a calendar date (the same everywhere in the world). */
function weekdayOf(date: CalendarDate): DayOfWeek {
  return DAYS_BY_NUMBER[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] as DayOfWeek;
}

/** The calendar date this many days after another. */
function addDays(date: CalendarDate, days: number): CalendarDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** "09:30" as minutes into the day (570). */
function minutesOfClockTime(clockTime: string): number {
  const [hours, minutes] = clockTime.split(':').map(Number);
  return (hours as number) * 60 + (minutes as number);
}

/**
 * The moment (a UTC instant) at which the wall clock of the time zone shows this date and time. A first guess is corrected by how far
 * off the time zone was at that guess, and once more in case the correction crossed a clock change.
 */
function wallClockToInstant(date: CalendarDate, minutesIntoDay: number, timeZone: string): Date {
  const wantedAsUtc = Date.UTC(date.year, date.month - 1, date.day, 0, minutesIntoDay);
  let guess = wantedAsUtc;
  for (let correction = 0; correction < 2; correction += 1) {
    const clock = readWallClock(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(clock.year, clock.month - 1, clock.day, 0, clock.minutesIntoDay);
    guess -= shownAsUtc - wantedAsUtc;
  }
  return new Date(guess);
}

/** True when the business is open at this moment. A business with no hours given is treated as open (nothing says otherwise). */
export function isOpenAt(hours: WeeklyHoursValue | undefined, instant: Date, timeZone: string): boolean {
  if (hours === undefined || 'allDay' in hours) return true;
  const clock = readWallClock(instant, timeZone);
  const today = hours.days[clock.weekday];
  if (!today) return false;
  return (
    clock.minutesIntoDay >= minutesOfClockTime(today.open) && clock.minutesIntoDay < minutesOfClockTime(today.close)
  );
}

/** When the business opens next. */
export interface NextOpening {
  instant: Date;
  /** Today in the business's time zone, tomorrow, or a later day. */
  when: 'today' | 'tomorrow' | 'later';
  weekday: DayOfWeek;
  /** The opening time as the business wrote it, like "09:30". */
  clockTime: string;
}

/** The next time the business opens after this moment, or undefined when it never does (no day is open, or it is open all day). */
export function findNextOpening(
  hours: WeeklyHoursValue | undefined,
  instant: Date,
  timeZone: string,
): NextOpening | undefined {
  if (hours === undefined || 'allDay' in hours) return undefined;
  const clock = readWallClock(instant, timeZone);
  for (let daysAhead = 0; daysAhead <= SEARCH_DAYS_AHEAD; daysAhead += 1) {
    const date = addDays(clock, daysAhead);
    const weekday = weekdayOf(date);
    const openingTime = hours.days[weekday]?.open;
    if (openingTime === undefined) continue;
    // Today only counts when it has not opened yet
    if (daysAhead === 0 && minutesOfClockTime(openingTime) <= clock.minutesIntoDay) continue;
    return {
      instant: wallClockToInstant(date, minutesOfClockTime(openingTime), timeZone),
      when: daysAhead === 0 ? 'today' : daysAhead === 1 ? 'tomorrow' : 'later',
      weekday,
      clockTime: openingTime,
    };
  }
  return undefined;
}
