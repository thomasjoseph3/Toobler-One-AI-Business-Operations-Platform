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
  it('tells the "own leads only" role about no conversation events', () => {
    expect(listEventNamesForRole('staff_own')).toEqual([]);
    expect(listEventNamesForRole('manager')).toContain('conversation.message');
  });
});
