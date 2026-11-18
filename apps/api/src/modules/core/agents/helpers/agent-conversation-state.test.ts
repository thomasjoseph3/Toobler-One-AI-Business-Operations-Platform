import type { WeeklyHoursValue } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_AGENT_CONVERSATION_STATE,
  looksLikeEmail,
  looksLikePhoneNumber,
  recordDetails,
  recordHumanCallback,
  saveDetailsInputSchema,
  type PromiseContext,
} from './agent-conversation-state';

const hours: WeeklyHoursValue = {
  days: { mon: { open: '09:00', close: '18:00' }, tue: { open: '09:00', close: '18:00' } },
};
const openContext: PromiseContext = {
  now: new Date('2026-11-16T04:00:00Z'), // Monday 09:30 in India: open
  timeZone: 'Asia/Kolkata',
  weeklyHours: hours,
};
const closedContext: PromiseContext = { ...openContext, now: new Date('2026-11-16T13:00:00Z') }; // Monday 18:30

describe('recordDetails', () => {
  it('saves what the customer said under readable labels', () => {
    const change = recordDetails(
      EMPTY_AGENT_CONVERSATION_STATE,
      { name: 'Ravi', interestedIn: 'a deluxe room' },
      openContext,
    );
    expect(change.state.details).toEqual({ Name: 'Ravi', 'Interested in': 'a deluxe room' });
  });

  it('makes no promise until it has a phone number, and tells the model to ask for it', () => {
    const change = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { name: 'Ravi' }, openContext);
    expect(change.state.promise).toBeNull();
    expect(change.messageForModel).toContain("customer's phone number");
    expect(change.messageForModel).toContain('Make no promise yet');
  });

  it('makes the promise once there is a phone, and gives the model the exact words', () => {
    const change = recordDetails(
      EMPTY_AGENT_CONVERSATION_STATE,
      { name: 'Ravi', phone: '+91 98470 12345' },
      openContext,
    );
    expect(change.state.promise).toMatchObject({ kind: 'call_back_open' });
    expect(change.messageForModel).toContain('"Our team will call you within 15 minutes."');
  });

  it('promises the opening time when the business is closed', () => {
    const change = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, closedContext);
    expect(change.state.promise?.sentence).toBe("We're closed now. Someone will call you tomorrow at 9 AM.");
  });

  it('makes only one promise: saving more later does not make another', () => {
    const first = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, openContext);
    const second = recordDetails(first.state, { dates: '5 to 7 December' }, closedContext);
    expect(second.state.promise).toEqual(first.state.promise);
    expect(second.messageForModel).toContain('Do not make another one');
    expect(second.state.details['Dates']).toBe('5 to 7 December');
  });

  it('does not save a phone that does not look right, and asks again', () => {
    const change = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '12ab' }, openContext);
    expect(change.state.details['Phone']).toBeUndefined();
    expect(change.state.promise).toBeNull();
    expect(change.messageForModel).toContain('does not look right');
  });

  it('promises the confirmation to a customer ready to book who gave only an email', () => {
    const change = recordDetails(
      EMPTY_AGENT_CONVERSATION_STATE,
      { email: 'ravi@example.com', readyToBook: true },
      openContext,
    );
    expect(change.state.promise).toMatchObject({ kind: 'send_confirmation' });
  });

  it('still needs a phone for a sale, even with an email', () => {
    const change = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { email: 'ravi@example.com' }, openContext);
    expect(change.state.promise).toBeNull();
  });

  it('does not change the state it was given', () => {
    const before = { ...EMPTY_AGENT_CONVERSATION_STATE };
    recordDetails(before, { name: 'Ravi', phone: '9847012345' }, openContext);
    expect(before).toEqual(EMPTY_AGENT_CONVERSATION_STATE);
  });
});

describe('recordHumanCallback', () => {
  it('turns the conversation into a not-a-sale one and promises the manager, once it can reach the customer', () => {
    const withPhone = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, openContext).state;
    // A promise was already made as a sale, so no second promise is made
    const change = recordHumanCallback(withPhone, 'The customer complained about a dirty room', openContext);
    expect(change.state.situation).toBe('not_a_sale');
    expect(change.state.promise?.kind).toBe('call_back_open');
    expect(change.messageForModel).toContain('Do not make another one');
  });

  it('promises "passed to the manager" for a complaint when no promise was made yet', () => {
    const withEmail = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { email: 'ravi@example.com' }, openContext).state;
    const change = recordHumanCallback(withEmail, 'A complaint', openContext);
    expect(change.state.promise).toMatchObject({ kind: 'passed_to_manager' });
    expect(change.messageForModel).toContain("I've passed this to the manager, who will get back to you.");
  });

  it('asks for a way to reach the customer first, and makes no promise yet', () => {
    const change = recordHumanCallback(EMPTY_AGENT_CONVERSATION_STATE, 'A complaint', openContext);
    expect(change.state.promise).toBeNull();
    expect(change.state.situation).toBe('not_a_sale');
    expect(change.messageForModel).toContain('phone number or email');
  });

  it('keeps a not-a-sale conversation not a sale, even when the customer later says they are ready to book', () => {
    const complaint = recordHumanCallback(EMPTY_AGENT_CONVERSATION_STATE, 'A complaint', openContext).state;
    const change = recordDetails(complaint, { phone: '9847012345', readyToBook: true }, openContext);
    expect(change.state.situation).toBe('not_a_sale');
    expect(change.state.promise?.kind).toBe('passed_to_manager');
  });

  it('keeps only a short reason', () => {
    const change = recordHumanCallback(EMPTY_AGENT_CONVERSATION_STATE, 'x'.repeat(500), openContext);
    expect(change.state.callbackReason).toHaveLength(300);
  });
});

describe('the checks on what the model saves', () => {
  it('accepts phone numbers written the usual ways, and refuses text and numbers that are too short or long', () => {
    for (const good of ['9847012345', '+91 98470 12345', '(0484) 234-5678'])
      expect(looksLikePhoneNumber(good)).toBe(true);
    for (const bad of ['12345', 'call me', '98470123456789012', '98470abc45'])
      expect(looksLikePhoneNumber(bad)).toBe(false);
  });

  it('accepts an email address and refuses text that is not one', () => {
    expect(looksLikeEmail('ravi@example.com')).toBe(true);
    for (const bad of ['ravi', 'ravi@', 'ravi@example', 'ra vi@example.com']) expect(looksLikeEmail(bad)).toBe(false);
  });

  it('refuses a field it does not know, so the model cannot save anything it likes', () => {
    expect(saveDetailsInputSchema.safeParse({ name: 'Ravi', accountId: 'someone-else' }).success).toBe(false);
    expect(saveDetailsInputSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('a promise chosen in this same message can still be corrected; one the customer has heard cannot', () => {
  const thisMessage: PromiseContext = { ...openContext, promiseSaidInEarlierMessage: false };
  const earlierMessage: PromiseContext = { ...openContext, promiseSaidInEarlierMessage: true };

  it('a sales callback becomes "passed to the manager" when it turns out to be a complaint, in the same message', () => {
    const sale = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, thisMessage).state;
    expect(sale.promise?.kind).toBe('call_back_open');
    const change = recordHumanCallback(sale, 'A complaint about a dirty room', thisMessage);
    expect(change.state.promise?.kind).toBe('passed_to_manager');
    expect(change.messageForModel).toContain('"I\'ve passed this to the manager, who will get back to you."');
    expect(change.messageForModel).not.toContain('Do not make another one');
  });

  it('keeps the promise the customer already heard in an earlier message, even for a complaint', () => {
    const sale = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, thisMessage).state;
    const change = recordHumanCallback(sale, 'A complaint', earlierMessage);
    expect(change.state.promise?.kind).toBe('call_back_open');
    expect(change.messageForModel).toContain('Do not make another one');
  });

  it('a callback becomes the booking confirmation when the customer is ready to book, in the same message', () => {
    const first = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, thisMessage).state;
    const change = recordDetails(first, { readyToBook: true }, thisMessage);
    expect(change.state.promise?.kind).toBe('send_confirmation');
    expect(change.messageForModel).toContain('"We\'ll send you the confirmation and booking link."');
  });

  it('keeps a callback the customer already heard when they say they are ready to book later', () => {
    const first = recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, thisMessage).state;
    const change = recordDetails(first, { readyToBook: true }, earlierMessage);
    expect(change.state.promise?.kind).toBe('call_back_open');
    expect(change.state.situation).toBe('ready_to_book');
  });

  it('never replaces "passed to the manager" or a confirmation with a sales callback', () => {
    const complaint = recordHumanCallback(
      recordDetails(EMPTY_AGENT_CONVERSATION_STATE, { phone: '9847012345' }, thisMessage).state,
      'A complaint',
      thisMessage,
    ).state;
    const again = recordDetails(complaint, { dates: '5 to 7 December', readyToBook: true }, thisMessage);
    expect(again.state.promise?.kind).toBe('passed_to_manager');
    expect(again.state.situation).toBe('not_a_sale');
  });
});

describe('the facts that score a lead (F10)', () => {
  const context = { now: new Date('2026-11-18T10:00:00Z'), timeZone: 'Asia/Dubai', weeklyHours: undefined };

  it('remembers that the price was asked, and the dates, and never forgets them', () => {
    const first = recordDetails(
      EMPTY_AGENT_CONVERSATION_STATE,
      { askedPrice: true, dateFrom: '2026-12-12', dateTo: '2026-12-15' },
      context,
    );
    expect(first.state).toMatchObject({ askedPrice: true, dateFrom: '2026-12-12', dateTo: '2026-12-15' });
    const second = recordDetails(first.state, { name: 'Priya' }, context);
    expect(second.state).toMatchObject({ askedPrice: true, dateFrom: '2026-12-12', dateTo: '2026-12-15' });
  });

  it('does not save dates the wrong way round and tells the model to ask again', () => {
    const change = recordDetails(
      EMPTY_AGENT_CONVERSATION_STATE,
      { dateFrom: '2026-12-15', dateTo: '2026-12-12' },
      context,
    );
    expect(change.state.dateFrom).toBeNull();
    expect(change.messageForModel).toContain('last day is before the first day');
  });

  it('refuses a made-up date in the tool input', () => {
    expect(saveDetailsInputSchema.safeParse({ dateFrom: '2026-02-31' }).success).toBe(false);
    expect(saveDetailsInputSchema.safeParse({ dateFrom: '2026-02-28' }).success).toBe(true);
    expect(saveDetailsInputSchema.safeParse({ dateFrom: 'next week' }).success).toBe(false);
  });
});
