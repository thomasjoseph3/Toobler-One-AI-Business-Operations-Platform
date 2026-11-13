import { describe, expect, it } from 'vitest';
import {
  describeShownRange,
  findChannelLabel,
  findLeadDisplayName,
  findOwnerLabel,
  findStageTagTone,
  formatBudget,
  formatCallbackDate,
  formatLeadDate,
  formatMoment,
  toWhatsappDigits,
} from './lead-display';

const contact = (fields: Partial<{ name: string | null; phone: string | null; email: string | null }>) => ({
  id: 'c1',
  name: null,
  phone: null,
  email: null,
  ...fields,
});

describe('findLeadDisplayName', () => {
  it('shows the name when there is one', () => {
    expect(findLeadDisplayName(contact({ name: 'Priya Menon', phone: '+919847011201' }))).toBe('Priya Menon');
  });
  it('falls back to the phone, then the email', () => {
    expect(findLeadDisplayName(contact({ phone: '+919847012312', email: 'a@example.com' }))).toBe('+919847012312');
    expect(findLeadDisplayName(contact({ email: 'deepa@example.com' }))).toBe('deepa@example.com');
  });
  it('says so when the contact was deleted or has nothing', () => {
    expect(findLeadDisplayName(null)).toBe('Contact removed');
    expect(findLeadDisplayName(contact({}))).toBe('Unknown contact');
  });
});

describe('findChannelLabel', () => {
  it('gives words for all five channels', () => {
    expect(findChannelLabel('manual')).toBe('Added by hand');
    expect(findChannelLabel('web_chat')).toBe('Web chat');
    expect(findChannelLabel('whatsapp')).toBe('WhatsApp');
    expect(findChannelLabel('email')).toBe('Email');
    expect(findChannelLabel('phone')).toBe('Phone call');
  });
});

describe('findOwnerLabel', () => {
  it('says You for the signed-in person, Team member for anyone else, Unassigned for nobody', () => {
    expect(findOwnerLabel('me', 'me')).toBe('You');
    expect(findOwnerLabel('someone-else', 'me')).toBe('Team member');
    expect(findOwnerLabel(null, 'me')).toBe('Unassigned');
  });
});

describe('findStageTagTone', () => {
  const openStages = ['s-new', 's-contacted', 's-quoted', 's-four', 's-five'];
  it('colours the first four open stages with the designer tones, by place not by name', () => {
    expect(findStageTagTone({ id: 's-new', kind: 'open' }, openStages)).toBe('new');
    expect(findStageTagTone({ id: 's-contacted', kind: 'open' }, openStages)).toBe('contacted');
    expect(findStageTagTone({ id: 's-quoted', kind: 'open' }, openStages)).toBe('qualified');
    expect(findStageTagTone({ id: 's-four', kind: 'open' }, openStages)).toBe('rate-sent');
  });
  it('gives Won and Lost their own tones, and any further open stage a neutral one', () => {
    expect(findStageTagTone({ id: 'won', kind: 'won' }, openStages)).toBe('won');
    expect(findStageTagTone({ id: 'lost', kind: 'lost' }, openStages)).toBe('lost');
    expect(findStageTagTone({ id: 's-five', kind: 'open' }, openStages)).toBe('neutral');
    expect(findStageTagTone({ id: 'unknown', kind: 'open' }, openStages)).toBe('neutral');
  });
});

describe('formatCallbackDate', () => {
  it('shows the day and month in the business time zone', () => {
    // 22 Nov 21:00 UTC is already 23 Nov in India (UTC+5:30)
    expect(formatCallbackDate('2026-11-22T21:00:00.000Z', 'Asia/Kolkata')).toBe('23 Nov');
    expect(formatCallbackDate('2026-11-22T21:00:00.000Z', 'UTC')).toBe('22 Nov');
  });
  it('is empty when there is no callback', () => {
    expect(formatCallbackDate(null, 'Asia/Kolkata')).toBeNull();
  });
});

describe('describeShownRange', () => {
  it('describes the first, a middle and the last page, and an empty list', () => {
    expect(describeShownRange(1, 25, 60)).toBe('1–25');
    expect(describeShownRange(2, 25, 60)).toBe('26–50');
    expect(describeShownRange(3, 25, 60)).toBe('51–60');
    expect(describeShownRange(1, 25, 1)).toBe('1');
    expect(describeShownRange(1, 25, 0)).toBe('0');
  });
});

describe('formatLeadDate', () => {
  it('shows a plain date as day, month and year, never a day off', () => {
    expect(formatLeadDate('2026-12-20')).toBe('20 Dec 2026');
    expect(formatLeadDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatLeadDate(null)).toBeNull();
  });
});

describe('formatBudget', () => {
  it('shows rupees with Indian grouping, and paise only when there are some', () => {
    expect(formatBudget(4_500_000)).toBe('₹45,000');
    expect(formatBudget(12_000_000)).toBe('₹1,20,000');
    expect(formatBudget(450_050)).toBe('₹4,500.50');
    expect(formatBudget(0)).toBe('₹0');
    expect(formatBudget(null)).toBeNull();
  });
});

describe('formatMoment', () => {
  it('shows date and time in the business time zone', () => {
    expect(formatMoment('2026-11-22T04:30:00.000Z', 'Asia/Kolkata')).toBe('22 Nov 2026, 10:00 am');
    expect(formatMoment('2026-11-22T21:00:00.000Z', 'Asia/Kolkata')).toBe('23 Nov 2026, 2:30 am');
    expect(formatMoment(null, 'Asia/Kolkata')).toBeNull();
  });
});

describe('toWhatsappDigits', () => {
  it('keeps only the digits of an international number', () => {
    expect(toWhatsappDigits('+919847011201')).toBe('919847011201');
    expect(toWhatsappDigits('+91 98470-11201')).toBe('919847011201');
  });
});
