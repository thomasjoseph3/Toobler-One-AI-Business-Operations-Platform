import { describe, expect, it } from 'vitest';
import { idleConversationCutoff } from './idle-conversation-rule';

describe('idleConversationCutoff', () => {
  it('is the given number of minutes before now', () => {
    expect(idleConversationCutoff(new Date('2026-11-19T12:00:00Z'), 30).toISOString()).toBe('2026-11-19T11:30:00.000Z');
    expect(idleConversationCutoff(new Date('2026-11-19T12:00:00Z'), 360).toISOString()).toBe(
      '2026-11-19T06:00:00.000Z',
    );
  });
});
