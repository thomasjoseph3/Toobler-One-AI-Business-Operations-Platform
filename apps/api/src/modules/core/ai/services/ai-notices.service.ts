import type { Database } from '../../../../kernel/database';
import type { MailMessage, MailSender } from '../../../../providers/mail';
import type { NoticeRecipient } from '../helpers/ai-notice-emails';
import * as healthRepository from '../repositories/ai-health.repository';

const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * Sends the AI warning emails, each problem at most once in a while. A warning has a key (what it is about); it goes out only if that
 * key has not been sent in the last `repeatAfterHours` (a problem that stays gets one reminder a day), or never before when
 * `repeatAfterHours` is null (a retirement date or a new model is announced once). The mail goes out first and is noted afterwards,
 * so a failed send is tried again by the job's retry. A business with nobody to tell is skipped quietly.
 */
export function createAiNoticeSender({
  database,
  mail,
  now = () => new Date(),
}: {
  database: Database;
  mail: MailSender;
  now?: () => Date;
}) {
  return {
    /** The platform team's people. */
    findPlatformAdmins: (): Promise<NoticeRecipient[]> => healthRepository.findPlatformAdmins(database.system),

    /** The managers of a business. */
    findManagers: (accountId: string): Promise<NoticeRecipient[]> =>
      healthRepository.findManagersOf(database.system, accountId),

    /**
     * Sends `buildEmail(person)` to each person, unless this warning key was already sent recently. Returns true when emails went out.
     * Returns false when it was skipped (already sent, or nobody to send to).
     */
    async sendOnce(options: {
      noticeKey: string;
      repeatAfterHours: number | null;
      recipients: NoticeRecipient[];
      buildEmail: (person: NoticeRecipient) => MailMessage;
    }): Promise<boolean> {
      if (options.recipients.length === 0) return false;
      const lastSentAt = await healthRepository.findNoticeSentAt(database.system, options.noticeKey);
      if (lastSentAt !== undefined) {
        if (options.repeatAfterHours === null) return false;
        if (now().getTime() - lastSentAt.getTime() < options.repeatAfterHours * MILLISECONDS_PER_HOUR) return false;
      }
      for (const person of options.recipients) await mail.send(options.buildEmail(person));
      await healthRepository.noteNoticeSent(database.system, options.noticeKey, now());
      return true;
    },
  };
}

export type AiNoticeSender = ReturnType<typeof createAiNoticeSender>;
