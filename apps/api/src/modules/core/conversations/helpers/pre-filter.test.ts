import { describe, expect, it } from 'vitest';
import { preFilter, type PreFilterInput } from './pre-filter';

/** An ordinary conversation that no rule matches, with anything in `changes` replacing the defaults. */
const conversation = (changes: Partial<PreFilterInput> = {}): PreFilterInput => ({
  channel: 'webchat',
  conversationEnded: false,
  customerMessageCount: 3,
  blockedPhoneKeys: new Set<string>(),
  blockedEmails: new Set<string>(),
  staffPhoneKeys: new Set<string>(),
  staffEmails: new Set<string>(),
  ...changes,
});

describe('preFilter: silence and empty chats', () => {
  it('calls a call of under 10 seconds with no speech no_conversation', () => {
    expect(preFilter(conversation({ channel: 'phone', callDurationSeconds: 4, callerSpoke: false }))).toEqual({
      typeKey: 'no_conversation',
      reason: 'silent_call',
    });
  });

  it('does the same when it is not known whether the caller spoke', () => {
    expect(preFilter(conversation({ channel: 'phone', callDurationSeconds: 9 }))?.typeKey).toBe('no_conversation');
  });

  it('lets a short call through when the caller did speak', () => {
    expect(preFilter(conversation({ channel: 'phone', callDurationSeconds: 6, callerSpoke: true }))).toBeNull();
  });

  it('lets a call of exactly 10 seconds through (the limit is "under 10")', () => {
    expect(preFilter(conversation({ channel: 'phone', callDurationSeconds: 10, callerSpoke: false }))).toBeNull();
  });

  it('lets a long silent call through (the AI decides what that was)', () => {
    expect(preFilter(conversation({ channel: 'phone', callDurationSeconds: 90, callerSpoke: false }))).toBeNull();
  });

  it('does not judge a call whose length is not known', () => {
    expect(preFilter(conversation({ channel: 'phone' }))).toBeNull();
  });

  it('calls a chat that ended with no message from the customer no_conversation, on web chat and on WhatsApp', () => {
    for (const channel of ['webchat', 'whatsapp'] as const) {
      expect(preFilter(conversation({ channel, conversationEnded: true, customerMessageCount: 0 }))).toEqual({
        typeKey: 'no_conversation',
        reason: 'empty_chat',
      });
    }
  });

  it('lets a chat that has not ended yet through, and one where the customer wrote', () => {
    expect(preFilter(conversation({ conversationEnded: false, customerMessageCount: 0 }))).toBeNull();
    expect(preFilter(conversation({ conversationEnded: true, customerMessageCount: 1 }))).toBeNull();
  });
});

describe('preFilter: machine-made email', () => {
  const email = (headers: Record<string, string>, sender = 'priya@example.com'): PreFilterInput =>
    conversation({ channel: 'email', email: sender, emailHeaders: headers });

  it('calls an email with Auto-Submitted automated, in any capitals', () => {
    expect(preFilter(email({ 'Auto-Submitted': 'auto-replied' }))).toEqual({
      typeKey: 'automated',
      reason: 'automated_email',
    });
    expect(preFilter(email({ 'AUTO-SUBMITTED': 'auto-generated' }))?.typeKey).toBe('automated');
  });

  it('lets "Auto-Submitted: no" through, because that says a person wrote it', () => {
    expect(preFilter(email({ 'Auto-Submitted': 'no' }))).toBeNull();
  });

  it('calls an email with List-Unsubscribe automated', () => {
    expect(preFilter(email({ 'List-Unsubscribe': '<mailto:stop@shop.example>' }))?.typeKey).toBe('automated');
  });

  it('calls bulk, junk and list precedence automated, and not other precedence', () => {
    for (const precedence of ['bulk', 'Junk', 'LIST']) {
      expect(preFilter(email({ Precedence: precedence }))?.typeKey).toBe('automated');
    }
    expect(preFilter(email({ Precedence: 'first-class' }))).toBeNull();
  });

  it('calls an email from a noreply-style sender automated', () => {
    for (const sender of [
      'noreply@shop.example',
      'no-reply@shop.example',
      'No_Reply@shop.example',
      'donotreply@bank.example',
      'do-not-reply@bank.example',
      'mailer-daemon@mail.example',
      'postmaster@mail.example',
      'bounce@mail.example',
      'noreply+orders@shop.example',
    ]) {
      expect(preFilter(email({}, sender))?.typeKey, sender).toBe('automated');
    }
  });

  it('does not mistake a real person for a machine', () => {
    for (const sender of ['priya@example.com', 'noah@example.com', 'reply@example.com', 'norman.reply@example.com']) {
      expect(preFilter(email({}, sender)), sender).toBeNull();
    }
  });

  it('does not apply the email rules to other channels', () => {
    expect(preFilter(conversation({ channel: 'whatsapp', emailHeaders: { 'Auto-Submitted': 'yes' } }))).toBeNull();
  });
});

describe("preFilter: the block list and the business's own staff", () => {
  it('calls a blocked number or email spam', () => {
    const blocked = { blockedPhoneKeys: new Set(['919847012345']), blockedEmails: new Set(['seller@spam.example']) };
    expect(preFilter(conversation({ ...blocked, channel: 'phone', phoneKey: '919847012345' }))).toEqual({
      typeKey: 'spam',
      reason: 'blocked',
    });
    expect(preFilter(conversation({ ...blocked, channel: 'email', email: 'Seller@Spam.example' }))?.typeKey).toBe(
      'spam',
    );
    expect(preFilter(conversation({ ...blocked, channel: 'phone', phoneKey: '919847000000' }))).toBeNull();
  });

  it("calls the business's own staff internal", () => {
    const staff = { staffPhoneKeys: new Set(['919847011111']), staffEmails: new Set(['meera@nairstays.example']) };
    expect(preFilter(conversation({ ...staff, channel: 'phone', phoneKey: '919847011111' }))).toEqual({
      typeKey: 'internal',
      reason: 'own_staff',
    });
    expect(preFilter(conversation({ ...staff, channel: 'email', email: 'MEERA@nairstays.example' }))?.typeKey).toBe(
      'internal',
    );
  });

  it('matches on either the number or the email', () => {
    const blocked = { blockedPhoneKeys: new Set(['919847012345']), blockedEmails: new Set(['seller@spam.example']) };
    expect(
      preFilter(conversation({ ...blocked, phoneKey: '919847012345', email: 'someone@else.example' }))?.typeKey,
    ).toBe('spam');
    expect(
      preFilter(conversation({ ...blocked, phoneKey: '910000000000', email: 'seller@spam.example' }))?.typeKey,
    ).toBe('spam');
  });

  it('knows nothing about a conversation with no number and no email', () => {
    expect(preFilter(conversation())).toBeNull();
  });
});

describe('preFilter: which rule wins', () => {
  it('puts silence before everything else', () => {
    const input = conversation({
      channel: 'phone',
      callDurationSeconds: 3,
      callerSpoke: false,
      phoneKey: '919847012345',
      blockedPhoneKeys: new Set(['919847012345']),
    });
    expect(preFilter(input)?.typeKey).toBe('no_conversation');
  });

  it('puts machine email before the block list', () => {
    const input = conversation({
      channel: 'email',
      email: 'noreply@spam.example',
      blockedEmails: new Set(['noreply@spam.example']),
    });
    expect(preFilter(input)?.typeKey).toBe('automated');
  });

  it('puts the block list before "our own staff"', () => {
    const input = conversation({
      phoneKey: '919847012345',
      blockedPhoneKeys: new Set(['919847012345']),
      staffPhoneKeys: new Set(['919847012345']),
    });
    expect(preFilter(input)?.typeKey).toBe('spam');
  });
});
