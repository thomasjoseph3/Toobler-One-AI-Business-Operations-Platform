import { describe, expect, it } from 'vitest';
import {
  addLine,
  canSendMessage,
  describePromise,
  findToolWords,
  formatDueTime,
  hasHeldBackAmounts,
  listDetails,
  takeBackLastLine,
  uniqueSources,
} from './test-chat-state';

describe('the chat lines', () => {
  it('adds a line without changing the earlier ones', () => {
    const before = [{ sender: 'customer' as const, body: 'Hi' }];
    const after = addLine(before, { sender: 'agent', body: 'Hello' });
    expect(before).toHaveLength(1);
    expect(after.map((line) => line.body)).toEqual(['Hi', 'Hello']);
  });

  it('takes back the customer’s last line so it can be typed again, and does nothing when the last line is the agent’s', () => {
    expect(takeBackLastLine([{ sender: 'agent', body: 'Hello' }, { sender: 'customer', body: 'Price?' }])).toEqual({
      lines: [{ sender: 'agent', body: 'Hello' }],
      text: 'Price?',
    });
    expect(takeBackLastLine([{ sender: 'agent', body: 'Hello' }])).toEqual({ lines: [{ sender: 'agent', body: 'Hello' }], text: '' });
    expect(takeBackLastLine([])).toEqual({ lines: [], text: '' });
  });
});

describe('words for the tools', () => {
  it('has words for the six tools the agent has, and none for one it does not know', () => {
    for (const tool of ['get_business_info', 'list_offerings', 'search_knowledge', 'log_unanswered_question', 'save_details', 'request_human_callback']) {
      expect(findToolWords(tool), tool).not.toBeNull();
    }
    expect(findToolWords('something_new')).toBeNull();
  });
});

describe('the promise', () => {
  it('shows the due time in the business’s own time zone', () => {
    // 10:00 UTC is 15:30 in India and 14:00 in Dubai
    expect(formatDueTime('2026-11-17T10:00:00.000Z', 'Asia/Kolkata')).toBe('15:30 on 17 Nov');
    expect(formatDueTime('2026-11-17T10:00:00.000Z', 'Asia/Dubai')).toBe('14:00 on 17 Nov');
  });

  it('says no time for a promise that has none', () => {
    expect(describePromise({ kind: 'passed_to_manager', sentence: "I've passed this to the manager.", dueAt: null }, 'Asia/Kolkata')).toEqual({
      sentence: "I've passed this to the manager.",
      due: null,
    });
    expect(
      describePromise({ kind: 'call_back_open', sentence: 'Our team will call you within 15 minutes.', dueAt: '2026-11-17T10:15:00.000Z' }, 'Asia/Kolkata').due,
    ).toBe('15:45 on 17 Nov');
  });
});

describe('details, sources and warnings', () => {
  it('lists what the customer said in order', () => {
    expect(listDetails({ Name: 'Ravi', Phone: '98470 12345' })).toEqual([
      { label: 'Name', value: 'Ravi' },
      { label: 'Phone', value: '98470 12345' },
    ]);
    expect(listDetails({})).toEqual([]);
  });

  it('shows each source once', () => {
    expect(
      uniqueSources([
        { kind: 'faq', label: 'Do you have parking?' },
        { kind: 'faq', label: 'Do you have parking?' },
        { kind: 'offerings', label: 'Offerings and offers' },
      ]),
    ).toHaveLength(2);
  });

  it('notices held-back amounts', () => {
    expect(hasHeldBackAmounts({ heldBackAmounts: [] })).toBe(false);
    expect(hasHeldBackAmounts({ heldBackAmounts: [12000] })).toBe(true);
  });

  it('allows a message with some words and not too many', () => {
    expect(canSendMessage('  ', 2000)).toBe(false);
    expect(canSendMessage('Hi', 2000)).toBe(true);
    expect(canSendMessage('x'.repeat(2001), 2000)).toBe(false);
  });
});
