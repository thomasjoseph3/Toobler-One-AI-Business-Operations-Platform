import { describe, expect, it } from 'vitest';
import {
  audienceForAlert,
  decideAlert,
  isAlertKindOptional,
  isWithinOfficeHours,
  localMinutesOfDay,
  REQUIRED_ALERT_KINDS,
  type OfficeHours,
} from './alert-rules';

// 09:00 to 18:00, night alerts off, the usual day.
const DAYTIME_HOURS: OfficeHours = { opensAtMinutes: 9 * 60, closesAtMinutes: 18 * 60, nightAlertsOn: false };
// 2026-11-19T06:30:00Z is 12:00 in Asia/Kolkata (+5:30) — inside office hours; and 06:30 in UTC — outside.
const MIDDAY_IST = new Date('2026-11-19T06:30:00.000Z');
// 2026-11-19T20:00:00Z is 01:30 IST — the middle of the night.
const NIGHT_IST = new Date('2026-11-19T20:00:00.000Z');

describe('office-hours helpers', () => {
  it('reads the local minutes past midnight in the business time zone', () => {
    expect(localMinutesOfDay(MIDDAY_IST, 'Asia/Kolkata')).toBe(12 * 60);
    expect(localMinutesOfDay(MIDDAY_IST, 'UTC')).toBe(6 * 60 + 30);
  });

  it('is within office hours at midday but not at night', () => {
    expect(isWithinOfficeHours(MIDDAY_IST, 'Asia/Kolkata', DAYTIME_HOURS)).toBe(true);
    expect(isWithinOfficeHours(NIGHT_IST, 'Asia/Kolkata', DAYTIME_HOURS)).toBe(false);
  });
});

describe('which kinds can be turned off', () => {
  it('keeps "needs a person" required and the rest optional', () => {
    expect(REQUIRED_ALERT_KINDS.has('needs_person')).toBe(true);
    expect(isAlertKindOptional('needs_person')).toBe(false);
    expect(isAlertKindOptional('hot_lead')).toBe(true);
    expect(isAlertKindOptional('callback_due')).toBe(true);
  });
});

describe('decideAlert', () => {
  it('sends an optional alert that is on, in hours', () => {
    expect(
      decideAlert({
        kind: 'hot_lead',
        isPreferenceOn: true,
        moment: MIDDAY_IST,
        timeZone: 'Asia/Kolkata',
        officeHours: DAYTIME_HOURS,
      }),
    ).toEqual({ send: true });
  });

  it('treats a missing preference as on', () => {
    expect(
      decideAlert({
        kind: 'hot_lead',
        isPreferenceOn: undefined,
        moment: MIDDAY_IST,
        timeZone: 'Asia/Kolkata',
        officeHours: DAYTIME_HOURS,
      }),
    ).toEqual({ send: true });
  });

  it('does not send an optional alert the person turned off', () => {
    expect(
      decideAlert({
        kind: 'hot_lead',
        isPreferenceOn: false,
        moment: MIDDAY_IST,
        timeZone: 'Asia/Kolkata',
        officeHours: DAYTIME_HOURS,
      }),
    ).toEqual({ send: false, reason: 'turned_off' });
  });

  it('always sends a required alert, even when "off" is passed', () => {
    expect(
      decideAlert({
        kind: 'needs_person',
        isPreferenceOn: false,
        moment: MIDDAY_IST,
        timeZone: 'Asia/Kolkata',
        officeHours: DAYTIME_HOURS,
      }),
    ).toEqual({ send: true });
  });

  it('holds an alert outside office hours when night alerts are off', () => {
    expect(
      decideAlert({
        kind: 'needs_person',
        isPreferenceOn: true,
        moment: NIGHT_IST,
        timeZone: 'Asia/Kolkata',
        officeHours: DAYTIME_HOURS,
      }),
    ).toEqual({ send: false, reason: 'outside_office_hours' });
  });

  it('sends outside office hours when the business turned night alerts on', () => {
    const nightOn: OfficeHours = { ...DAYTIME_HOURS, nightAlertsOn: true };
    expect(
      decideAlert({
        kind: 'hot_lead',
        isPreferenceOn: true,
        moment: NIGHT_IST,
        timeZone: 'Asia/Kolkata',
        officeHours: nightOn,
      }),
    ).toEqual({ send: true });
  });

  it('never gates the morning summary by hours (it runs at opening time)', () => {
    expect(
      decideAlert({
        kind: 'morning_summary',
        isPreferenceOn: true,
        moment: NIGHT_IST,
        timeZone: 'Asia/Kolkata',
        officeHours: DAYTIME_HOURS,
      }),
    ).toEqual({ send: true });
  });
});

describe('audienceForAlert', () => {
  it('maps each kind to who it is for', () => {
    expect(audienceForAlert('hot_lead')).toBe('owner');
    expect(audienceForAlert('callback_due')).toBe('owner');
    expect(audienceForAlert('callback_late')).toBe('managers');
    expect(audienceForAlert('morning_summary')).toBe('managers');
    expect(audienceForAlert('needs_person')).toBe('alert_number');
  });
});
