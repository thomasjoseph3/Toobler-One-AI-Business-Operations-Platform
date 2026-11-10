import type { MailMessage } from '../../../providers/mail';

/** The email with the link that confirms the person's address (works for 48 hours). */
export function buildVerificationEmail(details: {
  to: string;
  name: string;
  businessName: string;
  link: string;
}): MailMessage {
  return {
    to: details.to,
    subject: 'Confirm your email for Toobler One',
    text: [
      `Hi ${details.name},`,
      '',
      `Welcome to Toobler One. Please confirm your email address to finish setting up ${details.businessName}:`,
      '',
      details.link,
      '',
      'The link works for 48 hours. If you did not create this account, you can ignore this email.',
    ].join('\n'),
  };
}

/** The email with the link that lets the person choose a new password (works for 1 hour). */
export function buildPasswordResetEmail(details: { to: string; name: string; link: string }): MailMessage {
  return {
    to: details.to,
    subject: 'Reset your Toobler One password',
    text: [
      `Hi ${details.name},`,
      '',
      'Someone asked to reset the password of your Toobler One account. To choose a new one, open this link:',
      '',
      details.link,
      '',
      'The link works for 1 hour and only once. If you did not ask for this, you can ignore this email: your password has not changed.',
    ].join('\n'),
  };
}
