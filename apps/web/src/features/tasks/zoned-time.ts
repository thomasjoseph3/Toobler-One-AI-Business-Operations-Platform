// Dates and times as people type them ("17 Nov, 9:00 AM") in the business's own time zone, and back to the exact moment the API stores
// (UTC). Pure functions (no screen, no network), so each rule can be tested alone.

/** How many minutes the time zone is ahead of UTC at this moment (Asia/Kolkata is +330). */
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

/** The date ("2026-11-17") and time ("09:30") the clock on the wall shows in the time zone at this moment. */
export function readWallClock(moment: Date, timeZone: string): { date: string; time: string } {
  const offset = zoneOffsetMinutes(moment, timeZone);
  const wall = new Date(moment.getTime() + offset * 60_000).toISOString();
  return { date: wall.slice(0, 10), time: wall.slice(11, 16) };
}

/**
 * The exact moment (ISO, UTC) when the wall clock in the time zone shows this date ("2026-11-17") and time ("09:30"). Returns null when
 * the date or time is missing or is not a real one.
 */
export function wallClockToIsoMoment(date: string, time: string, timeZone: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/u.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])];
  const wallAsIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallAsIfUtc);
  // 31 February or 25:00 roll over into another date: not real
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  if (hour > 23 || minute > 59) return null;
  // Find the offset in force at that wall time (look again at the first answer, because a daylight saving change may sit in between)
  const firstGuess = new Date(wallAsIfUtc - zoneOffsetMinutes(new Date(wallAsIfUtc), timeZone) * 60_000);
  const moment = new Date(wallAsIfUtc - zoneOffsetMinutes(firstGuess, timeZone) * 60_000);
  return moment.toISOString();
}

/**
 * A sensible first due time for a new task: the next whole hour on the wall clock of the time zone (so 10:20 in India gives 11:00, even
 * though India is half an hour off a UTC hour), as wall-clock date and time.
 */
export function suggestDueWallClock(now: Date, timeZone: string): { date: string; time: string } {
  const offsetMilliseconds = zoneOffsetMinutes(now, timeZone) * 60_000;
  const wallNow = now.getTime() + offsetMilliseconds;
  const wallNextHour = Math.ceil((wallNow + 60_000) / 3_600_000) * 3_600_000;
  return readWallClock(new Date(wallNextHour - offsetMilliseconds), timeZone);
}
