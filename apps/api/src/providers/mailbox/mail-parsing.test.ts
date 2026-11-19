import { describe, expect, it } from 'vitest';
import {
  checkSender,
  chooseTextPart,
  htmlToText,
  isAutomatedEmail,
  parseHeaders,
  readMessageIds,
  replySubject,
  toPlainEmailText,
  withoutQuotedText,
} from './mail-parsing';

describe('parseHeaders', () => {
  it('joins folded lines and keeps the first of a repeated header', () => {
    const headers = parseHeaders(
      'Subject: Hello\r\n there\r\nAuthentication-Results: ours\r\nAuthentication-Results: theirs',
    );
    expect(headers['subject']).toBe('Hello there');
    expect(headers['authentication-results']).toBe('ours');
  });
});

describe('isAutomatedEmail', () => {
  it('ignores newsletters, notifications and bounces, and keeps people', () => {
    expect(isAutomatedEmail({ 'list-unsubscribe': '<x>' }, 'a@b.com')).toBe(true);
    expect(isAutomatedEmail({ 'auto-submitted': 'auto-generated' }, 'a@b.com')).toBe(true);
    expect(isAutomatedEmail({ precedence: 'bulk' }, 'a@b.com')).toBe(true);
    expect(isAutomatedEmail({}, 'no-reply@shop.com')).toBe(true);
    expect(isAutomatedEmail({}, 'mailer-daemon@x.com')).toBe(true);
    expect(isAutomatedEmail({ 'auto-submitted': 'no' }, 'priya@gmail.com')).toBe(false);
  });
});

describe('checkSender', () => {
  const gmailHost = 'imap.gmail.com';
  it('passes when DMARC passed', () => {
    expect(
      checkSender(
        { 'authentication-results': 'mx.google.com; dmarc=pass header.from=shop.com' },
        'a@shop.com',
        gmailHost,
      ),
    ).toBe('pass');
  });
  it('fails when DMARC failed, and when only unrelated checks passed', () => {
    expect(
      checkSender(
        { 'authentication-results': 'mx.google.com; dmarc=fail header.from=shop.com' },
        'a@shop.com',
        gmailHost,
      ),
    ).toBe('fail');
    expect(
      checkSender(
        { 'authentication-results': 'mx.google.com; spf=pass smtp.mailfrom=attacker.com' },
        'ceo@shop.com',
        gmailHost,
      ),
    ).toBe('fail');
  });
  it('trusts a pass of DKIM for the sender’s own domain', () => {
    expect(
      checkSender({ 'authentication-results': 'mx.google.com; dkim=pass header.d=shop.com' }, 'a@shop.com', gmailHost),
    ).toBe('pass');
  });
  it('says none when there is no check, and does not trust a header another server wrote on Gmail', () => {
    expect(checkSender({}, 'a@shop.com', gmailHost)).toBe('none');
    expect(checkSender({ 'authentication-results': 'evil.example; dmarc=pass' }, 'a@shop.com', gmailHost)).toBe('none');
    expect(checkSender({ 'authentication-results': 'mail.own.com; dmarc=pass' }, 'a@shop.com', 'imap.own.com')).toBe(
      'pass',
    );
  });
});

describe('text helpers', () => {
  it('reads message ids in order', () => {
    expect(readMessageIds('<a@x> <b@x>')).toEqual(['<a@x>', '<b@x>']);
    expect(readMessageIds(undefined)).toEqual([]);
  });
  it('turns HTML into text', () => {
    expect(htmlToText('<p>Hello&nbsp;<b>there</b></p><style>x{}</style><p>Bye &amp; thanks</p>')).toBe(
      'Hello there\nBye & thanks',
    );
  });
  it('cuts quoted history', () => {
    expect(withoutQuotedText('Yes please.\n\nOn Mon, 3 Nov 2026, Anita wrote:\n> Hello')).toBe('Yes please.');
    expect(withoutQuotedText('Thanks\n> quoted\nmore')).toBe('Thanks\nmore');
    expect(withoutQuotedText('Hi\n-----Original Message-----\nold')).toBe('Hi');
  });
  it('chooses the plain-text part, else HTML, and skips attachments', () => {
    const root = {
      childNodes: [
        { type: 'text/html', part: '2' },
        { type: 'text/plain', part: '1' },
        { type: 'text/plain', part: '3', disposition: 'attachment' },
      ],
    };
    expect(chooseTextPart(root)).toEqual({ part: '1', isHtml: false });
    expect(chooseTextPart({ type: 'text/html', part: '' })).toEqual({ part: '1', isHtml: true });
    expect(chooseTextPart(undefined)).toBeNull();
  });
  it('writes the reply as plain email text and the subject with one Re:', () => {
    expect(toPlainEmailText('## Rooms\n**Deluxe** room')).toBe('Rooms\n*Deluxe* room');
    expect(replySubject('Rooms for 4')).toBe('Re: Rooms for 4');
    expect(replySubject('re: Rooms for 4')).toBe('re: Rooms for 4');
    expect(replySubject('  ')).toBe('Re: your enquiry');
  });
});
