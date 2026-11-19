// When an email conversation counts as over. Pure: no database.

/** The moment before which a conversation's last activity makes it idle, for a thread that ends after `idleMinutes` of quiet. */
export function idleEmailCutoff(now: Date, idleMinutes: number): Date {
  return new Date(now.getTime() - idleMinutes * 60 * 1000);
}
