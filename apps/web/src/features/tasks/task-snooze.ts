// The quick choices for pushing a task to later ("In 1 hour", "Tomorrow morning", "Next week") and the exact moment each one means in the
// business's time zone. Pure functions (no screen, no network, the clock is passed in), so each rule can be tested alone.
import type { MessageKey } from '../../app/i18n';
import { readWallClock, wallClockToIsoMoment } from './zoned-time';

export type SnoozeChoice = 'hour' | 'tomorrow' | 'nextWeek';

/** The choices in the order they are shown, with their words. */
export const SNOOZE_CHOICES: ReadonlyArray<{ choice: SnoozeChoice; labelKey: MessageKey }> = [
  { choice: 'hour', labelKey: 'tasks.snooze.hour' },
  { choice: 'tomorrow', labelKey: 'tasks.snooze.tomorrow' },
  { choice: 'nextWeek', labelKey: 'tasks.snooze.nextWeek' },
];

/** The hour of the morning "Tomorrow morning" and "Next week" mean, on the business's wall clock. */
const MORNING_TIME = '09:00';

/** Adds whole days to a calendar date ("2026-11-17" plus 1 is "2026-11-18"). */
function addDaysToDate(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/** The exact moment (ISO, UTC) a snooze choice means: an hour from now, tomorrow at 9:00, or next Monday at 9:00 (business time zone). */
export function computeSnoozeMoment(choice: SnoozeChoice, now: Date, timeZone: string): string {
  if (choice === 'hour') return new Date(now.getTime() + 3_600_000).toISOString();
  const today = readWallClock(now, timeZone).date;
  let targetDate = addDaysToDate(today, 1);
  if (choice === 'nextWeek') {
    // The next Monday after today: a Monday today means a week away, not today
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const daysUntilMonday = (8 - weekday) % 7 || 7;
    targetDate = addDaysToDate(today, daysUntilMonday);
  }
  return wallClockToIsoMoment(targetDate, MORNING_TIME, timeZone) ?? now.toISOString();
}
