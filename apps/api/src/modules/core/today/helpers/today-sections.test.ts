import { describe, expect, it } from 'vitest';
import { buildTodaySections, type LeadForToday, type TaskForToday, type TodayBounds } from './today-sections';

// "Now" and the day boundaries are fixed so every rule is tested against plain, known dates (no clock, no time zone maths here).
const NOW = new Date('2026-11-18T10:00:00.000Z');
const BOUNDS: TodayBounds = {
  now: NOW,
  startOfTomorrow: new Date('2026-11-19T00:00:00.000Z'),
  startOfWeek: new Date('2026-11-16T00:00:00.000Z'), // Monday
  lastClosingTime: new Date('2026-11-17T18:00:00.000Z'),
};

/** A lead with sensible defaults; each test overrides only what it is about. */
function makeLead(overrides: Partial<LeadForToday> = {}): LeadForToday {
  return {
    id: 'lead-1',
    contactId: 'contact-1',
    ownerUserId: 'user-1',
    temperature: 'warm',
    stageKind: 'open',
    createdAt: new Date('2026-11-18T09:00:00.000Z'),
    callbackAt: null,
    closedAt: null,
    contactedAt: null,
    ...overrides,
  };
}

/** A task with sensible defaults. */
function makeTask(overrides: Partial<TaskForToday> = {}): TaskForToday {
  return {
    id: 'task-1',
    ownerUserId: 'user-1',
    dueAt: new Date('2026-11-18T15:00:00.000Z'),
    doneAt: null,
    ...overrides,
  };
}

describe('buildTodaySections', () => {
  it('puts past-due open tasks and past callbacks under Late, and nothing done or future', () => {
    const lateTask = makeTask({ id: 'late', dueAt: new Date('2026-11-18T08:00:00.000Z') });
    const doneTask = makeTask({ id: 'done', dueAt: new Date('2026-11-18T07:00:00.000Z'), doneAt: NOW });
    const futureTask = makeTask({ id: 'future', dueAt: new Date('2026-11-18T15:00:00.000Z') });
    const lateCallback = makeLead({ id: 'cb', callbackAt: new Date('2026-11-18T09:00:00.000Z') });
    const closedCallback = makeLead({
      id: 'closed-cb',
      stageKind: 'won',
      callbackAt: new Date('2026-11-18T09:00:00.000Z'),
    });

    const sections = buildTodaySections([lateCallback, closedCallback], [lateTask, doneTask, futureTask], BOUNDS);

    expect(sections.late.tasks.map((task) => task.taskId)).toEqual(['late']);
    expect(sections.late.leads.map((lead) => lead.leadId)).toEqual(['cb']);
  });

  it('shows only hot, open, untouched leads under Hot', () => {
    const hotNew = makeLead({ id: 'hot-new', temperature: 'hot' });
    const hotContacted = makeLead({ id: 'hot-touched', temperature: 'hot', contactedAt: NOW });
    const hotClosed = makeLead({ id: 'hot-closed', temperature: 'hot', stageKind: 'lost' });
    const warmNew = makeLead({ id: 'warm', temperature: 'warm' });

    const sections = buildTodaySections([hotNew, hotContacted, hotClosed, warmNew], [], BOUNDS);

    expect(sections.hot.map((lead) => lead.leadId)).toEqual(['hot-new']);
    expect(sections.hot[0]!.reason).toBe('hot');
  });

  it('puts tasks due later today (not past, not tomorrow) under Due today', () => {
    const laterToday = makeTask({ id: 'later', dueAt: new Date('2026-11-18T15:00:00.000Z') });
    const past = makeTask({ id: 'past', dueAt: new Date('2026-11-18T08:00:00.000Z') });
    const tomorrow = makeTask({ id: 'tomorrow', dueAt: new Date('2026-11-19T09:00:00.000Z') });

    const sections = buildTodaySections([], [laterToday, past, tomorrow], BOUNDS);

    expect(sections.dueToday.map((task) => task.taskId)).toEqual(['later']);
  });

  it('counts a lead that arrived since the last closing time, still untouched, as overnight', () => {
    const overnight = makeLead({ id: 'overnight', createdAt: new Date('2026-11-17T20:00:00.000Z') });
    const beforeClosing = makeLead({ id: 'old', createdAt: new Date('2026-11-17T12:00:00.000Z') });
    const alreadyTouched = makeLead({
      id: 'touched',
      createdAt: new Date('2026-11-17T20:00:00.000Z'),
      contactedAt: NOW,
    });

    const sections = buildTodaySections([overnight, beforeClosing, alreadyTouched], [], BOUNDS);

    expect(sections.overnight.map((lead) => lead.leadId)).toEqual(['overnight']);
    expect(sections.overnight[0]!.reason).toBe('new');
  });

  it('sums this week: in, contacted, won, and the average minutes to first reply', () => {
    // Came in Monday 10:00, first touched 11:00 → 60 minutes to first reply.
    const wonThisWeek = makeLead({
      id: 'won',
      stageKind: 'won',
      createdAt: new Date('2026-11-16T10:00:00.000Z'),
      contactedAt: new Date('2026-11-16T11:00:00.000Z'),
      closedAt: new Date('2026-11-17T10:00:00.000Z'),
    });
    // Came in Tuesday 10:00, first touched 12:00 → 120 minutes.
    const openThisWeek = makeLead({
      id: 'open',
      createdAt: new Date('2026-11-17T10:00:00.000Z'),
      contactedAt: new Date('2026-11-17T12:00:00.000Z'),
    });
    // Came in last week: not counted in "in" or the average.
    const lastWeek = makeLead({ id: 'old', createdAt: new Date('2026-11-10T10:00:00.000Z') });

    const sections = buildTodaySections([wonThisWeek, openThisWeek, lastWeek], [], BOUNDS);

    expect(sections.thisWeek.leadsIn).toBe(2);
    expect(sections.thisWeek.leadsContacted).toBe(2);
    expect(sections.thisWeek.leadsWon).toBe(1);
    expect(sections.thisWeek.averageMinutesToFirstReply).toBe(90); // (60 + 120) / 2
  });

  it('reports a null average when no lead this week has been touched', () => {
    const untouched = makeLead({ id: 'fresh', createdAt: new Date('2026-11-17T10:00:00.000Z'), contactedAt: null });
    const sections = buildTodaySections([untouched], [], BOUNDS);
    expect(sections.thisWeek.averageMinutesToFirstReply).toBeNull();
    expect(sections.thisWeek.leadsContacted).toBe(0);
  });
});
