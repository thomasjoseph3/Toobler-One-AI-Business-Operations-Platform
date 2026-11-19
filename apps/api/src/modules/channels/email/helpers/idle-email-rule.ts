// When an email conversation counts as over. Pure: no database.

/** An email thread quiet for this long has ended: it is sorted and summarised, and a later email in the thread starts a new conversation. */
export const IDLE_EMAIL_HOURS = 48;

/** The moment before which a conversation's last activity makes it idle. */
export function idleEmailCutoff(now: Date): Date {
  return new Date(now.getTime() - IDLE_EMAIL_HOURS * 60 * 60 * 1000);
}
