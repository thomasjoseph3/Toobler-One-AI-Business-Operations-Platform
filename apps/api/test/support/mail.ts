import type { MailMessage, MailSender } from '../../src/providers/mail';

/** A mail sender for tests: keeps every email it is given instead of sending it, and can be told to fail. */
export interface RecordingMailSender extends MailSender {
  readonly sent: MailMessage[];
  failNextSends(shouldFail: boolean): void;
  /** The token in the newest verification link sent to this address (the part after `token=`). */
  latestTokenFor(email: string): string | undefined;
}

/** Makes a recording mail sender. */
export function createRecordingMailSender(): RecordingMailSender {
  const sent: MailMessage[] = [];
  let failing = false;
  return {
    sent,
    failNextSends(shouldFail: boolean) {
      failing = shouldFail;
    },
    async send(message: MailMessage) {
      if (failing) throw new Error('the mail server is down');
      sent.push(message);
    },
    latestTokenFor(email: string) {
      const newest = [...sent].reverse().find((message) => message.to === email);
      return newest?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    },
  };
}
