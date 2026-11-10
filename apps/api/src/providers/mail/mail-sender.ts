// How the app sends email. The rest of the app only knows this shape; whether the message goes out through a real mail
// server or is printed to the log is decided once, in index.ts, from the settings.

/** One email to one person. */
export interface MailMessage {
  to: string;
  subject: string;
  /** The plain-text version (always sent; some mail apps show only this). */
  text: string;
  /** The formatted version. */
  html: string;
}

/** Something that can send an email. It throws if the message could not be handed over. */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}
