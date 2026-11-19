import { describe, expect, it } from 'vitest';
import type { Task } from '@toobler-one/shared';
import {
  buildCreateTaskRequest,
  buildEmptyTaskForm,
  buildTaskFormFromTask,
  buildUpdateTaskRequest,
  checkTaskForm,
} from './task-form';
import { computeSnoozeMoment } from './task-snooze';
import {
  buildLeadTasksPath,
  buildTasksPath,
  DEFAULT_TASKS_VIEW,
  findKindLabelKey,
  readTasksView,
  writeTasksView,
} from './tasks-view';
import { readWallClock, suggestDueWallClock, wallClockToIsoMoment } from './zoned-time';

describe('wall clock and exact moments', () => {
  it('turns a wall clock time in Kolkata into the exact UTC moment, and back', () => {
    expect(wallClockToIsoMoment('2026-11-17', '09:00', 'Asia/Kolkata')).toBe('2026-11-17T03:30:00.000Z');
    expect(readWallClock(new Date('2026-11-17T03:30:00Z'), 'Asia/Kolkata')).toEqual({
      date: '2026-11-17',
      time: '09:00',
    });
  });

  it('follows daylight saving (New York is -5 in winter and -4 in summer)', () => {
    expect(wallClockToIsoMoment('2026-01-15', '09:00', 'America/New_York')).toBe('2026-01-15T14:00:00.000Z');
    expect(wallClockToIsoMoment('2026-07-15', '09:00', 'America/New_York')).toBe('2026-07-15T13:00:00.000Z');
  });

  it('refuses a date or time that is missing or not real', () => {
    expect(wallClockToIsoMoment('', '09:00', 'Asia/Kolkata')).toBeNull();
    expect(wallClockToIsoMoment('2026-11-17', '', 'Asia/Kolkata')).toBeNull();
    expect(wallClockToIsoMoment('2026-02-31', '09:00', 'Asia/Kolkata')).toBeNull();
    expect(wallClockToIsoMoment('2026-11-17', '25:00', 'Asia/Kolkata')).toBeNull();
  });

  it('suggests the next whole hour', () => {
    // 10:20 in Kolkata -> 11:00
    expect(suggestDueWallClock(new Date('2026-11-17T04:50:00Z'), 'Asia/Kolkata')).toEqual({
      date: '2026-11-17',
      time: '11:00',
    });
    // exactly on the hour -> the hour after
    expect(suggestDueWallClock(new Date('2026-11-17T05:30:00Z'), 'Asia/Kolkata')).toEqual({
      date: '2026-11-17',
      time: '12:00',
    });
  });
});

describe('the Add task form', () => {
  const now = new Date('2026-11-17T04:50:00Z');
  const empty = buildEmptyTaskForm(now, 'Asia/Kolkata');

  it('starts as a to-do due at the next whole hour', () => {
    expect(empty).toEqual({ contactId: null, kind: 'todo', title: '', dueDate: '2026-11-17', dueTime: '11:00' });
  });

  it('asks for the person only when the task is not for a given lead, and for the words and a real time always', () => {
    expect(checkTaskForm(empty, { needsContact: true, timeZone: 'Asia/Kolkata' })).toEqual({
      contact: 'tasks.form.needContact',
      title: 'tasks.form.needTitle',
    });
    expect(checkTaskForm({ ...empty, title: 'Call' }, { needsContact: false, timeZone: 'Asia/Kolkata' })).toEqual({});
    expect(
      checkTaskForm({ ...empty, title: 'Call', dueDate: '' }, { needsContact: false, timeZone: 'Asia/Kolkata' }),
    ).toEqual({
      due: 'tasks.form.needDue',
    });
    expect(
      checkTaskForm({ ...empty, title: 'x'.repeat(201) }, { needsContact: false, timeZone: 'Asia/Kolkata' }).title,
    ).toBe('tasks.form.titleTooLong');
  });

  it('builds the request with the due time as an exact moment and trimmed words', () => {
    expect(
      buildCreateTaskRequest({ ...empty, kind: 'call', title: '  Call Priya  ' }, { leadId: 'l1' }, 'Asia/Kolkata'),
    ).toEqual({ leadId: 'l1', kind: 'call', title: 'Call Priya', dueAt: '2026-11-17T05:30:00.000Z' });
  });
});

describe('the Tasks view', () => {
  it('reads and writes the tab, the owner and the page in the web address, leaving out the defaults', () => {
    expect(writeTasksView(DEFAULT_TASKS_VIEW).toString()).toBe('');
    const view = { tab: 'overdue' as const, owner: 'me' as const, page: 3 };
    expect(writeTasksView(view).toString()).toBe('tab=overdue&owner=me&page=3');
    expect(readTasksView(new URLSearchParams('tab=overdue&owner=me&page=3'))).toEqual(view);
  });

  it('falls back to the defaults for anything unknown', () => {
    expect(readTasksView(new URLSearchParams('tab=someday&owner=x&page=-4'))).toEqual(DEFAULT_TASKS_VIEW);
  });

  it('builds the API addresses', () => {
    expect(buildTasksPath(DEFAULT_TASKS_VIEW)).toBe('/tasks?due=today&limit=25');
    expect(buildTasksPath({ tab: 'done', owner: 'me', page: 2 })).toBe('/tasks?due=done&limit=25&page=2&owner=me');
    expect(buildLeadTasksPath('l1')).toBe('/tasks?lead_id=l1&limit=100');
  });

  it('has words for every kind', () => {
    expect(findKindLabelKey('call')).toBe('tasks.kind.call');
    expect(findKindLabelKey('todo')).toBe('tasks.kind.todo');
  });
});

describe('snoozing', () => {
  // Tuesday 17 Nov 2026, 10:20 in India
  const now = new Date('2026-11-17T04:50:00Z');

  it('an hour from now is exactly an hour later', () => {
    expect(computeSnoozeMoment('hour', now, 'Asia/Kolkata')).toBe('2026-11-17T05:50:00.000Z');
  });

  it('tomorrow morning is 9:00 on the business wall clock the next day', () => {
    expect(computeSnoozeMoment('tomorrow', now, 'Asia/Kolkata')).toBe('2026-11-18T03:30:00.000Z');
  });

  it('next week is the coming Monday at 9:00, and a Monday means a week away', () => {
    expect(computeSnoozeMoment('nextWeek', now, 'Asia/Kolkata')).toBe('2026-11-23T03:30:00.000Z');
    // Monday 23 Nov 2026 at 10:20 India -> Monday 30 Nov
    expect(computeSnoozeMoment('nextWeek', new Date('2026-11-23T04:50:00Z'), 'Asia/Kolkata')).toBe(
      '2026-11-30T03:30:00.000Z',
    );
  });

  it('counts the day in the business time zone, not UTC (late evening India is still the same day)', () => {
    // 23:30 in India on 17 Nov is 18:00 UTC; tomorrow is still 18 Nov
    expect(computeSnoozeMoment('tomorrow', new Date('2026-11-17T18:00:00Z'), 'Asia/Kolkata')).toBe(
      '2026-11-18T03:30:00.000Z',
    );
  });
});

describe('editing a task', () => {
  const task: Task = {
    id: 't1',
    kind: 'call',
    title: 'Call Priya',
    dueAt: '2026-11-17T05:30:00.000Z',
    bucket: 'today',
    doneAt: null,
    contact: { id: 'c1', name: 'Priya' },
    leadId: 'l1',
    owner: { userId: 'u1', name: 'Anita' },
    createdByAgent: null,
    createdAt: '2026-11-16T10:00:00.000Z',
  };

  it('fills the form with the task, the due time on the wall clock', () => {
    expect(buildTaskFormFromTask(task, 'Asia/Kolkata')).toEqual({
      contactId: 'c1',
      kind: 'call',
      title: 'Call Priya',
      dueDate: '2026-11-17',
      dueTime: '11:00',
    });
  });

  it('does not move a due time that has seconds when only the words change', () => {
    const withSeconds = { ...task, dueAt: '2026-11-17T05:30:41.123Z' };
    const fields = { ...buildTaskFormFromTask(withSeconds, 'Asia/Kolkata'), title: 'New words' };
    expect(buildUpdateTaskRequest(fields, withSeconds, 'Asia/Kolkata')).toEqual({ title: 'New words' });
  });

  it('sends only what changed, and nothing when nothing changed', () => {
    const fields = buildTaskFormFromTask(task, 'Asia/Kolkata');
    expect(buildUpdateTaskRequest(fields, task, 'Asia/Kolkata')).toEqual({});
    expect(
      buildUpdateTaskRequest({ ...fields, title: ' Call Priya back ', dueTime: '12:30' }, task, 'Asia/Kolkata'),
    ).toEqual({
      title: 'Call Priya back',
      dueAt: '2026-11-17T07:00:00.000Z',
    });
  });
});
