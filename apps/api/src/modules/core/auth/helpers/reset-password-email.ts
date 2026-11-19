import type { MailMessage } from '../../../../providers/mail';
import { escapeHtml } from './verification-email';

/** The email that lets a person choose a new password. The link opens the web app's reset page. */
export function buildResetPasswordEmail(
  person: { name: string; email: string },
  link: string,
  hours: number,
): MailMessage {
  const subject = 'Reset your Toobler One password';
  const text = [
    `Hi ${person.name},`,
    '',
    'We got a request to reset your Toobler One password. Choose a new one here:',
    link,
    '',
    `This link works once and expires in ${hours} hour${hours === 1 ? '' : 's'}. If you did not ask for this, you can ignore this email: your password stays as it is.`,
  ].join('\n');
  const html = [
    `<p>Hi ${escapeHtml(person.name)},</p>`,
    '<p>We got a request to reset your Toobler One password. Choose a new one here:</p>',
    `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>`,
    `<p>This link works once and expires in ${hours} hour${hours === 1 ? '' : 's'}. If you did not ask for this, you can ignore this email: your password stays as it is.</p>`,
  ].join('\n');
  return { to: person.email, subject, text, html };
}
