import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_CONVERSATION_TYPES,
  SYSTEM_CONVERSATION_TYPES,
  listStartingConversationTypes,
  makeTypeKeyFromLabel,
} from './default-conversation-types';

describe('the starting conversation types', () => {
  it('has the 13 system types, with unique keys', () => {
    expect(SYSTEM_CONVERSATION_TYPES).toHaveLength(13);
    const keys = SYSTEM_CONVERSATION_TYPES.map((type) => type.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives a ticket kind and priority to every ticket outcome, and to no other outcome', () => {
    const everyType = [...SYSTEM_CONVERSATION_TYPES, ...Object.values(INDUSTRY_CONVERSATION_TYPES).flat()];
    for (const type of everyType) {
      const isTicket = type.outcome === 'ticket';
      expect(type.ticketType !== undefined, type.key).toBe(isTicket);
      expect(type.priority !== undefined, type.key).toBe(isTicket);
    }
  });

  it('keeps every key valid for the database, every type under five examples, and no key used twice across industries', () => {
    const everyType = [...SYSTEM_CONVERSATION_TYPES, ...Object.values(INDUSTRY_CONVERSATION_TYPES).flat()];
    for (const type of everyType) {
      expect(type.key).toMatch(/^[a-z][a-z0-9_]{0,59}$/);
      expect(type.examples.length).toBeLessThanOrEqual(5);
    }
    const keys = everyType.map((type) => type.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('follows the design: a complaint is a high-priority ticket needing a person with an immediate alert to the manager', () => {
    const complaint = SYSTEM_CONVERSATION_TYPES.find((type) => type.key === 'complaint');
    expect(complaint).toMatchObject({
      outcome: 'ticket',
      ticketType: 'complaint',
      priority: 'high',
      needsPerson: true,
      alert: { who: 'manager', when: 'now' },
    });
  });

  it('adds the hotel extras for a hotel, and nothing extra for an industry without any', () => {
    const hotel = listStartingConversationTypes('hotel_resort').map((type) => type.key);
    expect(hotel).toContain('in_house_guest_request');
    expect(hotel).toHaveLength(13 + 3);
    expect(listStartingConversationTypes('general')).toHaveLength(13);
  });
});

describe('makeTypeKeyFromLabel', () => {
  it('makes a lower-case key with underscores', () => {
    expect(makeTypeKeyFromLabel('Wedding enquiry!')).toBe('wedding_enquiry');
  });
  it('starts with a letter even when the label starts with a digit', () => {
    expect(makeTypeKeyFromLabel('24 hour help')).toBe('type_24_hour_help');
  });
  it('never gives a longer key than the database allows', () => {
    expect(makeTypeKeyFromLabel('a'.repeat(200))).toHaveLength(60);
  });
  it('falls back to a plain key when the label has no letters or digits', () => {
    expect(makeTypeKeyFromLabel('???')).toBe('type');
  });
});
