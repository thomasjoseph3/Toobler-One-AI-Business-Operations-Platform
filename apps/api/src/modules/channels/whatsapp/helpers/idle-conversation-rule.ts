// When a WhatsApp conversation counts as over. Pure: no database.

/** The moment before which a conversation's last activity makes it idle, for a conversation that ends after `idleMinutes` of quiet. */
export function idleConversationCutoff(now: Date, idleMinutes: number): Date {
  return new Date(now.getTime() - idleMinutes * 60 * 1000);
}
