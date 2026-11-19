import type { DayOfWeek } from '@toobler-one/shared';
import type { PlaceDetails, PlaceOpeningPeriod } from '../../../../providers/places';
import type { PrefilledAnswer } from '../../knowledge';

// Turns what Google says about a place into answers to the business questions. Plain code: the AI is not asked, so nothing is
// guessed. Pure: no network.

const DAYS_FROM_GOOGLE_DAY: readonly DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const twoDigits = (number: number) => String(number).padStart(2, '0');

/**
 * Google's opening periods as the answer to "Opening hours". Open round the clock gives `allDay`. A day with two periods (a lunch
 * break) or a period that runs past midnight cannot be written as one opening and one closing time, so then no answer is given at
 * all rather than a wrong one.
 */
export function openingPeriodsToHours(periods: readonly PlaceOpeningPeriod[]): unknown | null {
  if (periods.length === 0) return null;
  const firstPeriod = periods[0]!;
  if (periods.length === 1 && !firstPeriod.close && firstPeriod.open.hour === 0 && firstPeriod.open.minute === 0) {
    return { allDay: true };
  }
  const days: Partial<Record<DayOfWeek, { open: string; close: string }>> = {};
  for (const period of periods) {
    const day = DAYS_FROM_GOOGLE_DAY[period.open.day];
    if (!day || !period.close || period.close.day !== period.open.day || days[day]) return null;
    days[day] = {
      open: `${twoDigits(period.open.hour)}:${twoDigits(period.open.minute)}`,
      close: `${twoDigits(period.close.hour)}:${twoDigits(period.close.minute)}`,
    };
  }
  return { days };
}

/** The answers Google's listing gives: the name, the address, the phone number and the opening hours (each only when Google has it). */
export function listingToAnswers(place: PlaceDetails): PrefilledAnswer[] {
  const answers: PrefilledAnswer[] = [];
  if (place.name) answers.push({ questionKey: 'business_name', value: place.name });
  if (place.address) answers.push({ questionKey: 'address', value: place.address });
  if (place.phone)
    answers.push({ questionKey: 'contact_details', value: { rows: [{ kind: 'Phone', value: place.phone }] } });
  const hours = openingPeriodsToHours(place.openingPeriods);
  if (hours) answers.push({ questionKey: 'opening_hours', value: hours });
  return answers;
}
