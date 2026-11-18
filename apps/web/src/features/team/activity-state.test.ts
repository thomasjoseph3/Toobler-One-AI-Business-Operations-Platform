import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_PAGE_SIZE,
  buildAuditLogPath,
  describeActivityActor,
  describeActivityKind,
  EMPTY_ACTIVITY_FILTERS,
} from './activity-state';

describe('the activity request', () => {
  it('asks for the first page with nothing narrowed', () => {
    expect(buildAuditLogPath(EMPTY_ACTIVITY_FILTERS, 'Asia/Kolkata')).toBe(
      `/audit-log?page=1&limit=${ACTIVITY_PAGE_SIZE}`,
    );
  });

  it('narrows by person and by a group of areas', () => {
    const path = buildAuditLogPath(
      { ...EMPTY_ACTIVITY_FILTERS, personUserId: 'abc', groupKey: 'team' },
      'Asia/Kolkata',
    );
    expect(path).toContain('person=abc');
    expect(decodeURIComponent(path)).toContain('area=team,teams');
  });

  it('reads the days on the business’s own clock, and includes the whole "To" day', () => {
    const path = decodeURIComponent(
      buildAuditLogPath({ ...EMPTY_ACTIVITY_FILTERS, fromDate: '2026-11-17', toDate: '2026-11-18' }, 'Asia/Kolkata'),
    );
    // Midnight in India is 18:30 the evening before in UTC
    expect(path).toContain('from=2026-11-16T18:30:00.000Z');
    expect(path).toContain('to=2026-11-18T18:30:00.000Z');
  });

  it('leaves out a day that is not a real date', () => {
    expect(buildAuditLogPath({ ...EMPTY_ACTIVITY_FILTERS, fromDate: '2026-02-31' }, 'Asia/Kolkata')).not.toContain(
      'from=',
    );
  });
});

describe('a line in words', () => {
  it('names the person, or the kind of actor when it is not a person', () => {
    expect(describeActivityActor({ kind: 'user', userId: 'a', name: 'Anita Nair' })).toBe('Anita Nair');
    expect(describeActivityActor({ kind: 'user', userId: 'a', name: null })).toBe('Someone');
    expect(describeActivityActor({ kind: 'agent', userId: null, name: null })).toBe('The AI agent');
    expect(describeActivityActor({ kind: 'system', userId: null, name: null })).toBe('Toobler One');
  });

  it('turns a kind into words, and shows an unknown kind as it is so nothing is hidden', () => {
    expect(describeActivityKind('team.invited')).toBe('invited someone to the team');
    expect(describeActivityKind('brand_new.thing')).toBe('did something (brand_new.thing)');
  });
});
