import type { Config } from '../../kernel/config';
import { createConsoleMailSender } from './console-mail-sender';
import type { MailSender } from './mail-sender';
import { createSmtpMailSender } from './smtp-mail-sender';

export type { MailMessage, MailSender } from './mail-sender';

/** Picks the mail sender the settings ask for: a real mail server (smtp) or the terminal (console). */
export function createMailSender(config: Config, writeLine: (line: string) => void): MailSender {
  if (config.mail.provider === 'smtp') return createSmtpMailSender(config.mail.smtp, config.mail.from);
  return createConsoleMailSender(writeLine);
}
