import type { FastifyBaseLogger } from 'fastify';
import nodemailer from 'nodemailer';
import type { Config } from '../../kernel/config';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always present; it is what the console provider prints. */
  text: string;
  html?: string;
}

/** Sends email. The rest of the app only knows this interface, never a mail library or a server. */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

/** Sends through the SMTP server named in the settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM). */
function createSmtpMailProvider(mailConfig: Config['mail']): MailProvider {
  const transport = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    // Port 465 is encrypted from the start; the other usual ports upgrade the connection (STARTTLS) when they can.
    secure: mailConfig.port === 465,
    ...(mailConfig.user ? { auth: { user: mailConfig.user, pass: mailConfig.password } } : {}),
  });
  return {
    async send(message) {
      await transport.sendMail({
        from: mailConfig.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });
    },
  };
}

/**
 * For development without a mail server: prints the email's text (so you can click the link) to the log. It never
 * prints the address it was meant for. Never used in production (the settings check refuses that).
 */
function createConsoleMailProvider(logger: FastifyBaseLogger): MailProvider {
  return {
    async send(message) {
      // `emailPreview` is deliberately not on the redaction list: the link in it is the whole point of this provider.
      logger.info({ emailSubject: message.subject, emailPreview: message.text }, 'email (console provider, not sent)');
    },
  };
}

/** Chooses the mail provider from the settings. */
export function createMailProvider(mailConfig: Config['mail'], logger: FastifyBaseLogger): MailProvider {
  return mailConfig.provider === 'smtp' ? createSmtpMailProvider(mailConfig) : createConsoleMailProvider(logger);
}
