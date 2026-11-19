import { describe, expect, it } from 'vitest';
import { idleConversationCutoff } from './idle-conversation-rule';

describe('idleConversationCutoff', () => {
  it('is six hours before now', () => {
    expect(idleConversationCutoff(new Date('2026-11-19T12:00:00Z')).toISOString()).toBe('2026-11-19T06:00:00.000Z');
  });
});
