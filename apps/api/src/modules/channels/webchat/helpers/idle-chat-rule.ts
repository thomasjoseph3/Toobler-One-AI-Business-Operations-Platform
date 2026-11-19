// When a web chat counts as over. Pure: no database.

/** A chat that has been quiet this long has ended (owner decision, 16 Nov 2026). */
export const IDLE_CHAT_MINUTES = 15;

/** The moment before which a chat's last activity makes it idle: a chat whose last message is older than this has ended. */
export function idleChatCutoff(now: Date): Date {
  return new Date(now.getTime() - IDLE_CHAT_MINUTES * 60_000);
}
