import { describe, expect, it } from 'vitest';
import type { Activity } from '@toobler-one/shared';
import {
  buildNoteCountsPath,
  buildNoteRequest,
  buildNotesPath,
  canDeleteNote,
  canEditNote,
  checkNote,
  describeWriterName,
  describeWriterRole,
  formatTimeAgo,
  initialsOf,
  sortNotes,
  describeSystemLine,
  isSystemLine,
  kindForTimelineFilter,
} from './notes-state';

const note = (id: string, createdAt: string): Activity => ({
  id,
  kind: 'note',
  contactId: 'c',
  leadId: 'l',
  body: id,
  details: null,
  writtenBy: { kind: 'user', userId: 'u', name: 'Maya Chen', role: 'manager' },
  createdAt,
  editedAt: null,
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Maya Chen')).toBe('MC');
    expect(initialsOf('  anita   nair kumar ')).toBe('AN');
    expect(initialsOf('Rahul')).toBe('R');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('formatTimeAgo', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  it('uses the short words of the design', () => {
    expect(formatTimeAgo('2026-11-17T11:59:40Z', now)).toBe('just now');
    expect(formatTimeAgo('2026-11-17T11:55:00Z', now)).toBe('5 min. ago');
    expect(formatTimeAgo('2026-11-17T11:00:00Z', now)).toBe('1 hr. ago');
    expect(formatTimeAgo('2026-11-16T11:00:00Z', now)).toBe('1 day ago');
    expect(formatTimeAgo('2026-11-10T12:00:00Z', now)).toBe('7 days ago');
  });
  it('gives the plain date after a month, and never goes negative for a moment slightly in the future', () => {
    expect(formatTimeAgo('2026-09-01T12:00:00Z', now)).toBe('1 Sept 2026');
    expect(formatTimeAgo('2026-11-17T12:00:05Z', now)).toBe('just now');
  });
});

describe('sortNotes', () => {
  const notes = [
    note('b', '2026-11-17T10:00:00Z'),
    note('c', '2026-11-17T11:00:00Z'),
    note('a', '2026-11-17T09:00:00Z'),
  ];
  it('puts the newest last (like a chat) or first, and does not change the list it was given', () => {
    expect(sortNotes(notes, 'recentLast').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(sortNotes(notes, 'recentFirst').map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect(notes.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('writer words', () => {
  it('names the role, and falls back for an agent or a person who was removed', () => {
    expect(describeWriterRole({ kind: 'user', userId: 'u', name: 'A', role: 'manager' })).toBe('notes.role.manager');
    expect(describeWriterRole({ kind: 'user', userId: 'u', name: 'A', role: 'staff_own' })).toBe('notes.role.staff');
    expect(describeWriterRole({ kind: 'agent', userId: null, name: 'Aria', role: null })).toBe('notes.role.agent');
    expect(describeWriterRole({ kind: 'system', userId: null, name: null, role: null })).toBeNull();
    expect(describeWriterName({ kind: 'user', userId: 'u', name: 'Maya Chen', role: 'staff' })).toBe('Maya Chen');
    expect(describeWriterName({ kind: 'user', userId: 'u', name: null, role: null })).toBe('notes.writer.removed');
  });
});

describe('checkNote', () => {
  it('needs words and refuses too many', () => {
    expect(checkNote('   ')).toBe('notes.needText');
    expect(checkNote('x'.repeat(2001))).toBe('notes.tooLong');
    expect(checkNote('Prefers a ground floor room')).toBeNull();
  });
});

describe('who may change a note', () => {
  it('lets only the writer change the words, and only a manager delete', () => {
    const mine = note('n', '2026-11-17T10:00:00Z');
    expect(canEditNote(mine, 'u')).toBe(true);
    expect(canEditNote(mine, 'someone-else')).toBe(false);
    expect(canEditNote({ ...mine, writtenBy: { kind: 'agent', userId: null, name: 'Aria', role: null } }, 'u')).toBe(
      false,
    );
    expect(canDeleteNote('manager')).toBe(true);
    expect(canDeleteNote('staff')).toBe(false);
    expect(canDeleteNote('staff_own')).toBe(false);
  });
});

describe('addresses and requests', () => {
  it('lists the notes of a lead or of a person', () => {
    expect(buildNotesPath({ kind: 'lead', id: 'L1' })).toBe('/activities?lead_id=L1&limit=100');
    expect(buildNotesPath({ kind: 'contact', id: 'C1' })).toBe('/activities?contact_id=C1&limit=100');
  });

  it('adds a note with exactly one of leadId or contactId, trimmed', () => {
    expect(buildNoteRequest({ kind: 'lead', id: 'L1' }, '  Hello ')).toEqual({ leadId: 'L1', body: 'Hello' });
    expect(buildNoteRequest({ kind: 'contact', id: 'C1' }, 'Hi')).toEqual({ contactId: 'C1', body: 'Hi' });
  });

  it('asks for the counts of the leads on the page once each, and not at all when there are none', () => {
    expect(buildNoteCountsPath(['a', 'b', 'a'])).toBe('/activities/counts?lead_ids=a,b');
    expect(buildNoteCountsPath([])).toBeNull();
    expect(buildNoteCountsPath(Array.from({ length: 150 }, (_, index) => `id${index}`))!.split(',').length).toBe(100);
  });
});

describe('the timeline lines the system writes', () => {
  const line = (overrides: Partial<Activity>): Activity => ({
    ...note('line', '2026-11-17T10:00:00Z'),
    body: null,
    ...overrides,
  });

  it('tells a line from a note', () => {
    expect(isSystemLine(note('a', '2026-11-17T10:00:00Z'))).toBe(false);
    expect(isSystemLine(line({ kind: 'stage_changed' }))).toBe(true);
    expect(isSystemLine(line({ kind: 'lead_created' }))).toBe(true);
  });

  it('says who added the lead, or just that it was added', () => {
    expect(describeSystemLine(line({ kind: 'lead_created' }))).toEqual({
      messageKey: 'timeline.leadAddedBy',
      values: { name: 'Maya Chen' },
    });
    const nobody = { kind: 'system' as const, userId: null, name: null, role: null };
    expect(describeSystemLine(line({ kind: 'lead_created', writtenBy: nobody }))).toEqual({
      messageKey: 'timeline.leadAdded',
      values: {},
    });
  });

  it('says the stages a lead moved between, with or without the doer', () => {
    const details = { fromStageName: 'New', toStageName: 'Contacted' };
    expect(describeSystemLine(line({ kind: 'stage_changed', details }))).toEqual({
      messageKey: 'timeline.movedBy',
      values: { name: 'Maya Chen', from: 'New', to: 'Contacted' },
    });
    const nobody = { kind: 'system' as const, userId: null, name: null, role: null };
    expect(describeSystemLine(line({ kind: 'stage_changed', details, writtenBy: nobody })).messageKey).toBe(
      'timeline.moved',
    );
    expect(describeSystemLine(line({ kind: 'stage_changed', details: { toStageName: 'Won' } })).messageKey).toBe(
      'timeline.movedToBy',
    );
  });

  it('asks the API for the kind a chip stands for, and for everything under All', () => {
    expect(kindForTimelineFilter('all')).toBeUndefined();
    expect(kindForTimelineFilter('note')).toBe('note');
    expect(buildNotesPath({ kind: 'lead', id: 'l1' })).toBe('/activities?lead_id=l1&limit=100');
    expect(buildNotesPath({ kind: 'lead', id: 'l1' }, 'stage_changed')).toBe(
      '/activities?lead_id=l1&kind=stage_changed&limit=100',
    );
  });
});
