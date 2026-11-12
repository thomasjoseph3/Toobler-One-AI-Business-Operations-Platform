import { describe, expect, it } from 'vitest';
import { userIdFromActorStamp } from './actor-stamp';

describe('userIdFromActorStamp', () => {
  it('gives the id of a person', () => {
    expect(userIdFromActorStamp({ kind: 'user', id: 'abc' })).toBe('abc');
  });

  it('gives null for the system, the AI agent, an empty stamp and nonsense', () => {
    expect(userIdFromActorStamp({ kind: 'system', id: 'abc' })).toBeNull();
    expect(userIdFromActorStamp({ kind: 'agent', id: 'abc' })).toBeNull();
    expect(userIdFromActorStamp(null)).toBeNull();
    expect(userIdFromActorStamp('user')).toBeNull();
    expect(userIdFromActorStamp({ kind: 'user' })).toBeNull();
    expect(userIdFromActorStamp({ kind: 'user', id: 5 })).toBeNull();
  });
});
