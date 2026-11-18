import type { MailMessage } from '../../../../providers/mail';
import { escapeHtml } from './verification-email';

/** The email that invites a person to join a business. The link opens the web app's accept page, where they choose a password. */
export function buildInvitationEmail(details: {
  to: string;
  personName: string;
  businessName: string;
  invitedByName: string;
  link: string;
  hours: number;
}): MailMessage {
  const subject = `${details.invitedByName} invited you to ${details.businessName} on Toobler One`;
  const text = [
    `Hi ${details.personName},`,
    '',
    `${details.invitedByName} invited you to join ${details.businessName} on Toobler One. Choose your password here:`,
    details.link,
    '',
    `This link works once and expires in ${details.hours} hours. If you were not expecting it, you can ignore this email.`,
  ].join('\n');
  const html = [
    `<p>Hi ${escapeHtml(details.personName)},</p>`,
    `<p>${escapeHtml(details.invitedByName)} invited you to join ${escapeHtml(details.businessName)} on Toobler One.</p>`,
    `<p><a href="${escapeHtml(details.link)}">Choose your password</a></p>`,
    `<p>This link works once and expires in ${details.hours} hours. If you were not expecting it, you can ignore this email.</p>`,
  ].join('\n');
  return { to: details.to, subject, text, html };
}
