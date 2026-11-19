// When a WhatsApp conversation counts as over. Pure: no database.

/** A WhatsApp conversation quiet for this long has ended: it is sorted and summarised, and the customer's next message starts a new one. Customers on WhatsApp come back hours later, so this is longer than the website chat's 15 minutes. */
export const IDLE_CONVERSATION_HOURS = 6;

/** The moment before which a conversation's last activity makes it idle. */
export function idleConversationCutoff(now: Date): Date {
  return new Date(now.getTime() - IDLE_CONVERSATION_HOURS * 60 * 60 * 1000);
}
