import { describe, expect, it } from 'vitest';
import { describeLiveEvent, listEventNamesForRole } from './live-events';

describe('describeLiveEvent', () => {
  it('passes on the kind and the ids, and nothing else', () => {
    const id = '0194b6a0-3c5e-7000-8000-000000000001';
    expect(
      describeLiveEvent('conversation.message', { conversationId: id, sender: 'customer', body: 'secret' }),
    ).toEqual({
      event: 'conversation.message',
      conversationId: id,
    });
  });
  it('drops an id that does not look like one', () => {
    expect(describeLiveEvent('conversation.held', { conversationId: 'hello <script>' })).toEqual({
      event: 'conversation.held',
    });
  });
});

describe('listEventNamesForRole', () => {
  it('tells the "own leads only" role about its leads and tasks, but not conversations', () => {
    const ownLeadsOnly = listEventNamesForRole('staff_own');
    expect(ownLeadsOnly).not.toContain('conversation.message');
    expect(ownLeadsOnly).toContain('lead.created');
    expect(ownLeadsOnly).toContain('task.updated');
  });
  it('tells a manager about conversations and about leads and tasks', () => {
    const manager = listEventNamesForRole('manager');
    expect(manager).toContain('conversation.message');
    expect(manager).toContain('lead.created');
  });
});
