import { describe, expect, it } from 'vitest';
import { decideWhatToDoWithEnquiry, REOPEN_WINDOW_DAYS } from './open-lead-rule';

const now = new Date('2026-12-01T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe('decideWhatToDoWithEnquiry (rule R6)', () => {
  it('starts a new lead for someone with no lead', () => {
    expect(decideWhatToDoWithEnquiry({ latestLead: undefined, now })).toBe('start_new_lead');
  });

  it('attaches to an open lead, however old it is', () => {
    expect(decideWhatToDoWithEnquiry({ latestLead: { stageKind: 'open', closedAt: null }, now })).toBe(
      'attach_to_open_lead',
    );
  });

  it('reopens a lead that was lost less than 60 days ago', () => {
    for (const days of [0, 1, 30, 59]) {
      expect(
        decideWhatToDoWithEnquiry({ latestLead: { stageKind: 'lost', closedAt: daysAgo(days) }, now }),
        `${days} days`,
      ).toBe('reopen_lost_lead');
    }
  });

  it('lets the conversation type decide for a lead that was won less than 60 days ago', () => {
    for (const days of [0, 1, 30, 59]) {
      expect(
        decideWhatToDoWithEnquiry({ latestLead: { stageKind: 'won', closedAt: daysAgo(days) }, now }),
        `${days} days`,
      ).toBe('decide_by_conversation_type');
    }
  });

  it('starts a new lead once 60 days have passed (exactly 60 days counts as passed)', () => {
    expect(REOPEN_WINDOW_DAYS).toBe(60);
    for (const stageKind of ['won', 'lost'] as const) {
      for (const days of [60, 61, 365]) {
        expect(
          decideWhatToDoWithEnquiry({ latestLead: { stageKind, closedAt: daysAgo(days) }, now }),
          `${stageKind} ${days}`,
        ).toBe('start_new_lead');
      }
    }
  });

  it('treats a lost lead closed one millisecond inside the window as recent', () => {
    const justInside = new Date(now.getTime() - (REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000 - 1));
    expect(decideWhatToDoWithEnquiry({ latestLead: { stageKind: 'lost', closedAt: justInside }, now })).toBe(
      'reopen_lost_lead',
    );
  });
});
