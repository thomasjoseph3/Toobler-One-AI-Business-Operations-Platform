import { describe, expect, it } from 'vitest';
import { IDLE_CHAT_MINUTES, idleChatCutoff } from './idle-chat-rule';

describe('idleChatCutoff', () => {
  it('is 15 minutes before now', () => {
    expect(IDLE_CHAT_MINUTES).toBe(15);
    expect(idleChatCutoff(new Date('2026-11-16T10:30:00Z')).toISOString()).toBe('2026-11-16T10:15:00.000Z');
  });
});
