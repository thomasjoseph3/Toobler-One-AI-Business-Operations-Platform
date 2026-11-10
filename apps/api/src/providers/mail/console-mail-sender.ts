import type { MailMessage, MailSender } from './mail-sender';

/**
 * For development without a mail server: prints the email (including its link) in the API's terminal instead of sending
 * it. Never used in production (the settings refuse it there), because the log would then hold working links.
 */
export function createConsoleMailSender(writeLine: (line: string) => void): MailSender {
  return {
    async send(message: MailMessage): Promise<void> {
      writeLine(
        `--- Email (not sent; MAIL_PROVIDER is console) ---\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n---`,
      );
    },
  };
}
