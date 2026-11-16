import type { DayOfWeek, WeeklyHoursValue } from '@toobler-one/shared';
import { findNextOpening, isOpenAt } from './opening-hours';

// The one promise the agent ends a conversation with, chosen and timed by code. The AI says the sentence; it never picks the promise
// and never works out a time. Pure: no database.

/** What the conversation was, for the promise: a sale to follow up, a customer ready to book, or something that is not a sale. */
export type PromiseSituation = 'sale_enquiry' | 'ready_to_book' | 'not_a_sale';

export type PromiseKind = 'call_back_open' | 'call_back_closed' | 'send_confirmation' | 'passed_to_manager';

export interface ChosenPromise {
  kind: PromiseKind;
  /** What the agent says, word for word. */
  sentence: string;
  /** When the promise falls due (a callback time), or null when it has no time of its own. */
  dueAt: Date | null;
}

/** How many minutes the business promises to call back within while it is open. A setting per business comes later; every business has this one. */
export const DEFAULT_CALLBACK_MINUTES = 15;

const DAY_NAMES: Readonly<Record<DayOfWeek, string>> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** "09:00" as "9 AM", "13:30" as "1:30 PM". */
export function describeClockTime(clockTime: string): string {
  const [hours, minutes] = clockTime.split(':').map(Number) as [number, number];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hoursOnTwelveHourClock = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${hoursOnTwelveHourClock} ${suffix}`
    : `${hoursOnTwelveHourClock}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/**
 * Chooses the promise. A sale during opening hours: "within N minutes". A sale outside them: a call at the next opening time. A customer
 * ready to book: the confirmation will be sent. Anything that is not a sale: it has been passed to the manager. With no hours given the
 * business is treated as open.
 */
export function chooseThePromise(input: {
  situation: PromiseSituation;
  now: Date;
  timeZone: string;
  weeklyHours: WeeklyHoursValue | undefined;
  callbackMinutes?: number;
}): ChosenPromise {
  if (input.situation === 'not_a_sale') {
    return {
      kind: 'passed_to_manager',
      sentence: "I've passed this to the manager, who will get back to you.",
      dueAt: null,
    };
  }
  if (input.situation === 'ready_to_book') {
    return { kind: 'send_confirmation', sentence: "We'll send you the confirmation and booking link.", dueAt: null };
  }

  if (isOpenAt(input.weeklyHours, input.now, input.timeZone)) {
    const minutes = input.callbackMinutes ?? DEFAULT_CALLBACK_MINUTES;
    return {
      kind: 'call_back_open',
      sentence: `Our team will call you within ${minutes} minutes.`,
      dueAt: new Date(input.now.getTime() + minutes * 60_000),
    };
  }

  const nextOpening = findNextOpening(input.weeklyHours, input.now, input.timeZone);
  if (!nextOpening) {
    // Closed and no day is ever open: nothing true can be said about a time
    return {
      kind: 'call_back_closed',
      sentence: "We're closed now. Someone will call you as soon as we open.",
      dueAt: null,
    };
  }
  const whenWords =
    nextOpening.when === 'today'
      ? ''
      : nextOpening.when === 'tomorrow'
        ? 'tomorrow '
        : `on ${DAY_NAMES[nextOpening.weekday]} `;
  return {
    kind: 'call_back_closed',
    sentence: `We're closed now. Someone will call you ${whenWords}at ${describeClockTime(nextOpening.clockTime)}.`,
    dueAt: nextOpening.instant,
  };
}
