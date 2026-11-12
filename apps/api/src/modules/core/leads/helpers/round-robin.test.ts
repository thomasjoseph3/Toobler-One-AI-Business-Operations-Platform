import { describe, expect, it } from 'vitest';
import { pickNextPerson } from './round-robin';

describe('pickNextPerson', () => {
  const people = ['anil', 'rahul', 'meera'];

  it('gives nobody when nobody takes part', () => {
    expect(pickNextPerson({ userIds: [], lastAssignedUserId: null })).toBeNull();
    expect(pickNextPerson({ userIds: [], lastAssignedUserId: 'anil' })).toBeNull();
  });

  it('starts with the first person when nobody has had a turn', () => {
    expect(pickNextPerson({ userIds: people, lastAssignedUserId: null })).toBe('anil');
  });

  it('goes to the person after the last one, and wraps round at the end', () => {
    expect(pickNextPerson({ userIds: people, lastAssignedUserId: 'anil' })).toBe('rahul');
    expect(pickNextPerson({ userIds: people, lastAssignedUserId: 'rahul' })).toBe('meera');
    expect(pickNextPerson({ userIds: people, lastAssignedUserId: 'meera' })).toBe('anil');
  });

  it('starts again from the first person when the last one has left the list', () => {
    expect(pickNextPerson({ userIds: people, lastAssignedUserId: 'someone-removed' })).toBe('anil');
  });

  it('always picks the one person when only one takes part', () => {
    expect(pickNextPerson({ userIds: ['anil'], lastAssignedUserId: 'anil' })).toBe('anil');
    expect(pickNextPerson({ userIds: ['anil'], lastAssignedUserId: null })).toBe('anil');
  });

  it('shares 300 leads evenly: every person gets exactly 100', () => {
    const counts = new Map<string, number>();
    let last: string | null = null;
    for (let lead = 0; lead < 300; lead += 1) {
      const next = pickNextPerson({ userIds: people, lastAssignedUserId: last });
      counts.set(next!, (counts.get(next!) ?? 0) + 1);
      last = next;
    }
    expect([...counts.values()]).toEqual([100, 100, 100]);
  });

  it('keeps the shares within one of each other when the lead count is not a multiple', () => {
    const counts = new Map<string, number>();
    let last: string | null = null;
    for (let lead = 0; lead < 302; lead += 1) {
      const next = pickNextPerson({ userIds: people, lastAssignedUserId: last });
      counts.set(next!, (counts.get(next!) ?? 0) + 1);
      last = next;
    }
    expect([...counts.values()].sort()).toEqual([100, 101, 101]);
  });
});
