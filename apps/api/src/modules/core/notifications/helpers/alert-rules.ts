// Who an alert goes to and whether it may go out now — decided in code (F23). Pure logic: no database, no clock and no
// sending; the service passes the moment and the settings in, so every rule can be tested on its own. The channel
// (WhatsApp, with email as a back-up) is chosen elsewhere; this file only decides "send or not, and to whom".

/** The kinds of staff alert (requirement F23). */
export type AlertKind = 'hot_lead' | 'callback_due' | 'callback_late' | 'needs_person' | 'morning_summary';

/**
 * The alerts a person can never turn off (a manager keeps them on for everyone): a customer asking for a person or a
 * complaint must always reach the team. The rest are each person's own choice.
 */
export const REQUIRED_ALERT_KINDS: ReadonlySet<AlertKind> = new Set<AlertKind>(['needs_person']);

/** True when the kind is one a person may turn off in their own settings. */
export function isAlertKindOptional(kind: AlertKind): boolean {
  return !REQUIRED_ALERT_KINDS.has(kind);
}

/** The business's office hours and whether it allows alerts at night, all a service reads from the account. */
export interface OfficeHours {
  /** Local opening time, minutes past midnight (09:00 = 540). */
  opensAtMinutes: number;
  /** Local closing time, minutes past midnight (18:00 = 1080). */
  closesAtMinutes: number;
  /** When on, alerts go out at any hour; when off, only between opening and closing. */
  nightAlertsOn: boolean;
}

/** Turns a Date into minutes past midnight in the business's time zone (pure: the zone does the work, not a stored offset). */
export function localMinutesOfDay(moment: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(moment);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

/** True when `moment` is within the business's office hours (opening to closing) in its own time zone. */
export function isWithinOfficeHours(moment: Date, timeZone: string, hours: OfficeHours): boolean {
  const nowMinutes = localMinutesOfDay(moment, timeZone);
  // A normal day: opening is before closing. (An overnight business would set night alerts on instead.)
  return nowMinutes >= hours.opensAtMinutes && nowMinutes < hours.closesAtMinutes;
}

/** Why an alert was or was not sent, so the service can log it in plain words. */
export type AlertDecision = { send: true } | { send: false; reason: 'turned_off' | 'outside_office_hours' };

/**
 * Decides whether one alert may go out now. A required kind is always sent (subject to the hours rule); an optional kind
 * is sent only when the person has it on (a missing preference means on — alerts start on). Nothing goes out outside
 * office hours unless the business turned night alerts on; the morning summary is scheduled at opening time, so it is
 * never gated here.
 */
export function decideAlert(options: {
  kind: AlertKind;
  /** The recipient's own setting for this kind, or undefined when they have never changed it (then it is on). */
  isPreferenceOn: boolean | undefined;
  moment: Date;
  timeZone: string;
  officeHours: OfficeHours;
}): AlertDecision {
  const { kind, isPreferenceOn, moment, timeZone, officeHours } = options;

  if (isAlertKindOptional(kind) && isPreferenceOn === false) return { send: false, reason: 'turned_off' };

  // The morning summary runs at opening time by its schedule, so the hours rule does not apply to it.
  const isGatedByHours = kind !== 'morning_summary';
  if (isGatedByHours && !officeHours.nightAlertsOn && !isWithinOfficeHours(moment, timeZone, officeHours)) {
    return { send: false, reason: 'outside_office_hours' };
  }
  return { send: true };
}

/** Who an alert is for (requirement F23's table): the lead or task owner, the managers, or the business's alert number. */
export type AlertAudience = 'owner' | 'managers' | 'alert_number';

/** The audience for each alert kind, from the requirement's table. */
export function audienceForAlert(kind: AlertKind): AlertAudience {
  switch (kind) {
    case 'hot_lead':
    case 'callback_due':
      return 'owner';
    case 'callback_late':
    case 'morning_summary':
      return 'managers';
    case 'needs_person':
      return 'alert_number';
  }
}
