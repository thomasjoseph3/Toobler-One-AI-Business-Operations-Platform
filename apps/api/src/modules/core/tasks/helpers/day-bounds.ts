// Where "today" starts and ends for a business: tasks are due "today" in the business's own time zone, not in UTC. Pure functions (no
// database, no clock), so each rule can be tested alone.

/** How many minutes the time zone is ahead of UTC at this moment (Asia/Kolkata is +330). Handles daylight saving through the zone's rules. */
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

/** The moment (UTC) the calendar day that contains `moment` starts in the time zone: its local midnight. */
export function startOfDayInZone(moment: Date, timeZone: string): Date {
  const offsetNow = zoneOffsetMinutes(moment, timeZone);
  const localNow = new Date(moment.getTime() + offsetNow * 60_000);
  const localMidnightAsIfUtc = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
  // The offset at midnight can differ from the offset now (daylight saving changed in between), so look it up again at the guess
  const guess = new Date(localMidnightAsIfUtc - offsetNow * 60_000);
  const offsetAtMidnight = zoneOffsetMinutes(guess, timeZone);
  return new Date(localMidnightAsIfUtc - offsetAtMidnight * 60_000);
}

/** The moment (UTC) the next calendar day starts in the time zone (the end of today, exclusive). */
export function startOfNextDayInZone(moment: Date, timeZone: string): Date {
  // 36 hours after the start of today is always inside tomorrow, whatever a daylight saving change did to today's length
  const insideTomorrow = new Date(startOfDayInZone(moment, timeZone).getTime() + 36 * 3_600_000);
  return startOfDayInZone(insideTomorrow, timeZone);
}

/** Which tab a task belongs to at `now`: done, overdue (open and already past), today (open, due before tomorrow starts) or upcoming. */
export function bucketOfTask(
  task: { dueAt: Date; doneAt: Date | null },
  now: Date,
  startOfTomorrow: Date,
): 'overdue' | 'today' | 'upcoming' | 'done' {
  if (task.doneAt !== null) return 'done';
  if (task.dueAt.getTime() < now.getTime()) return 'overdue';
  if (task.dueAt.getTime() < startOfTomorrow.getTime()) return 'today';
  return 'upcoming';
}
