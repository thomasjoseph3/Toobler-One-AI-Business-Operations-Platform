import type { MailMessage } from '../../../../providers/mail';

/** Makes a name safe to place inside HTML, so a name like `<b>x</b>` is shown as text and not as markup. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** The email that asks a new person to confirm their address. The link opens the web app's verify page. */
export function buildVerificationEmail(
  person: { name: string; email: string },
  link: string,
  hours: number,
): MailMessage {
  const subject = 'Confirm your email for Toobler One';
  const text = [
    `Hi ${person.name},`,
    '',
    'Please confirm your email address to finish setting up your Toobler One account:',
    link,
    '',
    `This link works once and expires in ${hours} hours. If you did not create this account, you can ignore this email.`,
  ].join('\n');
  const html = [
    `<p>Hi ${escapeHtml(person.name)},</p>`,
    '<p>Please confirm your email address to finish setting up your Toobler One account:</p>',
    `<p><a href="${escapeHtml(link)}">Confirm my email</a></p>`,
    `<p>This link works once and expires in ${hours} hours. If you did not create this account, you can ignore this email.</p>`,
  ].join('\n');
  return { to: person.email, subject, text, html };
}
