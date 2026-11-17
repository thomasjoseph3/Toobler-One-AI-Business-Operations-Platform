import { describe, expect, it } from 'vitest';
import { buildLateAlertEmail, buildReminderEmail, escapeHtml, formatDueText } from './alert-emails';

const task = {
  title: 'Call Priya',
  contactName: 'Priya Menon',
  dueText: '17 Nov 2026, 9:00 am',
  businessName: 'Sea View Hotel',
};

describe('formatDueText', () => {
  it('writes the due time on the business clock', () => {
    expect(formatDueText(new Date('2026-11-17T03:30:00Z'), 'Asia/Kolkata')).toBe('17 Nov 2026, 9:00 am');
  });
});

describe('escapeHtml', () => {
  it('turns tags and quotes into harmless text', () => {
    expect(escapeHtml(`<b onclick="x">&'</b>`)).toBe('&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;');
  });
});

describe('the reminder email', () => {
  it('goes to the owner, names the task, the person and the time, in both versions', () => {
    const mail = buildReminderEmail({ to: 'owner@example.com', ownerName: 'Anita', task });
    expect(mail.to).toBe('owner@example.com');
    expect(mail.subject).toBe('Reminder: Call Priya');
    expect(mail.text).toContain('Hello Anita,');
    expect(mail.text).toContain('Call Priya (about Priya Menon)');
    expect(mail.text).toContain('Due: 17 Nov 2026, 9:00 am.');
    expect(mail.html).toContain('<p>Hello Anita,</p>');
  });

  it('leaves out "about" when the person has no name, and never lets staff words become HTML', () => {
    const mail = buildReminderEmail({
      to: 'owner@example.com',
      ownerName: 'Anita',
      task: { ...task, title: '<script>alert(1)</script>', contactName: null },
    });
    expect(mail.text).not.toContain('about');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('the late alert email', () => {
  it('goes to the manager and says who has not ticked it off', () => {
    const mail = buildLateAlertEmail({ to: 'boss@example.com', managerName: 'Boss', ownerName: 'Ravi', task });
    expect(mail.subject).toBe('Late task: Call Priya');
    expect(mail.text).toContain('Hello Boss,');
    expect(mail.text).toContain('It was due: 17 Nov 2026, 9:00 am.');
    expect(mail.text).toContain('Owner: Ravi.');
  });

  it('says nobody owns it when the owner has left', () => {
    const mail = buildLateAlertEmail({ to: 'boss@example.com', managerName: 'Boss', ownerName: null, task });
    expect(mail.text).toContain('Owner: nobody (they have left).');
  });
});
