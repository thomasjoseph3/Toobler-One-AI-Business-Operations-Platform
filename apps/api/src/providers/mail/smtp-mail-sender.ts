import nodemailer from 'nodemailer';
import type { MailMessage, MailSender } from './mail-sender';

/** The mail server's address and login, from the settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). */
export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** Sends email through a real mail server (SMTP). Port 465 uses an encrypted connection from the start; others upgrade it. */
export function createSmtpMailSender(settings: SmtpSettings, fromAddress: string): MailSender {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    ...(settings.user ? { auth: { user: settings.user, pass: settings.password } } : {}),
  });
  return {
    async send(message: MailMessage): Promise<void> {
      await transport.sendMail({
        from: fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
