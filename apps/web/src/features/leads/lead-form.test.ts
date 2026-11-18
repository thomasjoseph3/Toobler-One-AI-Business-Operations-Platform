import { describe, expect, it } from 'vitest';
import type { Lead } from '@toobler-one/shared';
import {
  buildContactRequest,
  buildLeadRequest,
  checkLeadForm,
  convertBusinessLocalTimeToUtc,
  EMPTY_LEAD_FORM,
  buildLeadChanges,
  checkLeadDetails,
  formatPaiseAsRupees,
  formatUtcAsBusinessLocalTime,
  leadToDetailsFields,
  parseRupeesToPaise,
  type LeadFormFields,
} from './lead-form';

const newPerson = (changes: Partial<LeadFormFields> = {}): LeadFormFields => ({
  ...EMPTY_LEAD_FORM,
  personMode: 'new',
  newName: 'Priya Menon',
  newPhone: '98470 11201',
  ...changes,
});

describe('parseRupeesToPaise', () => {
  it('turns rupees into whole paise, ignoring the rupee sign, commas and spaces', () => {
    expect(parseRupeesToPaise('45000')).toEqual({ isValid: true, paise: 4_500_000 });
    expect(parseRupeesToPaise('₹1,20,000')).toEqual({ isValid: true, paise: 12_000_000 });
    expect(parseRupeesToPaise('4500.50')).toEqual({ isValid: true, paise: 450_050 });
    expect(parseRupeesToPaise('0.1')).toEqual({ isValid: true, paise: 10 });
  });
  it('treats a blank box as no budget', () => {
    expect(parseRupeesToPaise('  ')).toEqual({ isValid: true, paise: null });
  });
  it('refuses text that is not an amount, too many decimals, negatives and absurd sums', () => {
    for (const text of ['abc', '12.345', '-5', '1e5', '10000000000000']) {
      expect(parseRupeesToPaise(text), text).toEqual({ isValid: false });
    }
  });
});

describe('convertBusinessLocalTimeToUtc', () => {
  it('reads the time in the business time zone, not the browser zone', () => {
    expect(convertBusinessLocalTimeToUtc('2026-11-22T10:00', 'Asia/Kolkata')).toBe('2026-11-22T04:30:00.000Z');
    expect(convertBusinessLocalTimeToUtc('2026-11-22T10:00', 'UTC')).toBe('2026-11-22T10:00:00.000Z');
  });
  it('follows daylight saving', () => {
    expect(convertBusinessLocalTimeToUtc('2026-01-15T09:00', 'America/New_York')).toBe('2026-01-15T14:00:00.000Z');
    expect(convertBusinessLocalTimeToUtc('2026-07-15T09:00', 'America/New_York')).toBe('2026-07-15T13:00:00.000Z');
  });
  it('is null for text that is not a real date and time', () => {
    expect(convertBusinessLocalTimeToUtc('2026-02-31T10:00', 'Asia/Kolkata')).toBeNull();
    expect(convertBusinessLocalTimeToUtc('2026-11-22', 'Asia/Kolkata')).toBeNull();
    expect(convertBusinessLocalTimeToUtc('soon', 'Asia/Kolkata')).toBeNull();
  });
});

describe('checkLeadForm', () => {
  it('accepts a new person with a name and a phone, and nothing else', () => {
    expect(checkLeadForm(newPerson(), 'Asia/Kolkata')).toEqual({});
  });
  it('needs a person: one found by searching, or a new one with a name and a phone or an email', () => {
    expect(checkLeadForm(EMPTY_LEAD_FORM, 'Asia/Kolkata')).toEqual({ person: 'leadForm.problem.person' });
    expect(checkLeadForm({ ...EMPTY_LEAD_FORM, existingContactId: 'c1' }, 'Asia/Kolkata')).toEqual({});
    expect(checkLeadForm(newPerson({ newName: ' ' }), 'Asia/Kolkata').newName).toBe('leadForm.problem.name');
    expect(checkLeadForm(newPerson({ newPhone: '', newEmail: '' }), 'Asia/Kolkata').newContact).toBe(
      'leadForm.problem.phoneOrEmail',
    );
    expect(checkLeadForm(newPerson({ newPhone: '', newEmail: 'a@example.com' }), 'Asia/Kolkata')).toEqual({});
  });
  it('checks the dates, the party size, the budget and the callback when they are filled in', () => {
    const problems = checkLeadForm(
      newPerson({
        dateFrom: '2026-12-20',
        dateTo: '2026-12-19',
        partySize: '0',
        budget: 'lots',
        callbackAt: '2026-02-31T10:00',
      }),
      'Asia/Kolkata',
    );
    expect(problems).toEqual({
      dateTo: 'leadForm.problem.dateOrder',
      partySize: 'leadForm.problem.partySize',
      budget: 'leadForm.problem.budget',
      callbackAt: 'leadForm.problem.callbackAt',
    });
    expect(checkLeadForm(newPerson({ partySize: '2.5' }), 'Asia/Kolkata').partySize).toBe('leadForm.problem.partySize');
  });
});

describe('what is sent to the API', () => {
  it('sends only the boxes that were filled in for the new person', () => {
    expect(buildContactRequest(newPerson())).toEqual({ name: 'Priya Menon', phone: '98470 11201' });
    expect(buildContactRequest(newPerson({ newPhone: '', newEmail: ' priya@example.com ' }))).toEqual({
      name: 'Priya Menon',
      email: 'priya@example.com',
    });
  });
  it('sends the person only when nothing else was filled in, and never the owner or the stage', () => {
    expect(buildLeadRequest(newPerson(), 'contact-1', 'Asia/Kolkata')).toEqual({ contactId: 'contact-1' });
  });
  it('sends every filled-in box in the form the API takes: paise and a UTC callback', () => {
    const request = buildLeadRequest(
      newPerson({
        interest: ' Family room, 3 nights ',
        dateFrom: '2026-12-20',
        dateTo: '2026-12-23',
        partySize: '4',
        budget: '45,000',
        callbackAt: '2026-11-22T10:00',
      }),
      'contact-1',
      'Asia/Kolkata',
    );
    expect(request).toEqual({
      contactId: 'contact-1',
      interest: 'Family room, 3 nights',
      dateFrom: '2026-12-20',
      dateTo: '2026-12-23',
      partySize: 4,
      budgetPaise: 4_500_000,
      callbackAt: '2026-11-22T04:30:00.000Z',
    });
  });
});

/** A lead as the API gives it, with the details a test wants to change. */
const aLead = (changes: Partial<Lead> = {}): Lead => ({
  id: 'lead-1',
  contactId: 'contact-1',
  contact: { id: 'contact-1', name: 'Priya Menon', phone: '+919847011201', email: null },
  stage: { id: 'stage-new', name: 'New', kind: 'open' },
  temperature: 'unscored',
  interest: 'Family room, 3 nights',
  dateFrom: '2026-12-20',
  dateTo: '2026-12-23',
  partySize: 4,
  budgetPaise: 4_500_000,
  promise: null,
  callbackAt: '2026-11-22T04:30:00.000Z',
  ownerUserId: 'user-1',
  offering: null,
  firstChannel: 'manual',
  lastActivityAt: '2026-11-13T09:00:00.000Z',
  lostReason: null,
  closedAt: null,
  custom: {},
  createdAt: '2026-11-13T09:00:00.000Z',
  updatedAt: '2026-11-13T09:00:00.000Z',
  ...changes,
});

describe('formatPaiseAsRupees and formatUtcAsBusinessLocalTime', () => {
  it('turn the stored values back into what the edit boxes show', () => {
    expect(formatPaiseAsRupees(4_500_000)).toBe('45000');
    expect(formatPaiseAsRupees(450_050)).toBe('4500.50');
    expect(formatPaiseAsRupees(null)).toBe('');
    expect(formatUtcAsBusinessLocalTime('2026-11-22T04:30:00.000Z', 'Asia/Kolkata')).toBe('2026-11-22T10:00');
    expect(formatUtcAsBusinessLocalTime('2026-07-15T13:00:00.000Z', 'America/New_York')).toBe('2026-07-15T09:00');
    expect(formatUtcAsBusinessLocalTime(null, 'Asia/Kolkata')).toBe('');
  });
  it('round-trip: what is shown converts back to the same moment', () => {
    const shown = formatUtcAsBusinessLocalTime('2026-11-22T04:30:00.000Z', 'Asia/Kolkata');
    expect(convertBusinessLocalTimeToUtc(shown, 'Asia/Kolkata')).toBe('2026-11-22T04:30:00.000Z');
  });
});

describe('leadToDetailsFields and buildLeadChanges', () => {
  it('fills the edit boxes from the lead', () => {
    expect(leadToDetailsFields(aLead(), 'Asia/Kolkata')).toEqual({
      interest: 'Family room, 3 nights',
      dateFrom: '2026-12-20',
      dateTo: '2026-12-23',
      partySize: '4',
      budget: '45000',
      callbackAt: '2026-11-22T10:00',
      promise: '',
    });
  });
  it('sends nothing when nothing was changed, even if the callback has seconds', () => {
    const lead = aLead({ callbackAt: '2026-11-22T04:30:42.000Z' });
    expect(buildLeadChanges(lead, leadToDetailsFields(lead, 'Asia/Kolkata'), 'Asia/Kolkata')).toEqual({});
  });
  it('sends only the fields that changed, in the form the API takes', () => {
    const lead = aLead();
    const edited = {
      ...leadToDetailsFields(lead, 'Asia/Kolkata'),
      interest: '  Two rooms  ',
      budget: '60,000',
      callbackAt: '2026-11-25T15:00',
      promise: 'Manager will call by 5 PM',
    };
    expect(buildLeadChanges(lead, edited, 'Asia/Kolkata')).toEqual({
      interest: 'Two rooms',
      budgetPaise: 6_000_000,
      callbackAt: '2026-11-25T09:30:00.000Z',
      promise: 'Manager will call by 5 PM',
    });
  });
  it('clears a field with null when its box was emptied', () => {
    const lead = aLead({ promise: 'Call by 5' });
    const edited = {
      ...leadToDetailsFields(lead, 'Asia/Kolkata'),
      interest: '',
      dateFrom: '',
      dateTo: '',
      partySize: '',
      budget: '',
      callbackAt: '',
      promise: ' ',
    };
    expect(buildLeadChanges(lead, edited, 'Asia/Kolkata')).toEqual({
      interest: null,
      dateFrom: null,
      dateTo: null,
      partySize: null,
      budgetPaise: null,
      callbackAt: null,
      promise: null,
    });
  });
  it('checks the details the same way as the create form', () => {
    const lead = aLead();
    const problems = checkLeadDetails(
      { ...leadToDetailsFields(lead, 'Asia/Kolkata'), dateTo: '2026-12-19', partySize: '0', budget: 'lots' },
      'Asia/Kolkata',
    );
    expect(problems).toEqual({
      dateTo: 'leadForm.problem.dateOrder',
      partySize: 'leadForm.problem.partySize',
      budget: 'leadForm.problem.budget',
    });
  });
});
