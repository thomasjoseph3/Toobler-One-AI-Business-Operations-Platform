// What the AI's words look like on WhatsApp, and when WhatsApp lets us write to a customer. Pure: no database.

/** The longest message WhatsApp accepts is 4096 characters; we stay under it. */
const MOST_CHARACTERS_SENT = 4000;

/** WhatsApp lets a business send free text only this long after the customer's last message. After that only approved templates may be sent. */
export const REPLY_WINDOW_HOURS = 24;

/** The AI's reply as WhatsApp shows it: *bold* instead of **bold**, links written out, no headings, and not too long. */
export function toWhatsAppText(reply: string): string {
  return reply
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_whole, label: string, url: string) =>
      label === url ? url : `${label}: ${url}`,
    )
    .replace(/^#{1,6}\s+/gm, '')
    .slice(0, MOST_CHARACTERS_SENT);
}

/** Whether free text may still be sent to a customer whose last message arrived at `lastCustomerMessageAt` (null: they never wrote, so no). */
export function isWithinReplyWindow(lastCustomerMessageAt: Date | null, now: Date): boolean {
  if (lastCustomerMessageAt === null) return false;
  return now.getTime() - lastCustomerMessageAt.getTime() < REPLY_WINDOW_HOURS * 60 * 60 * 1000;
}

/** "Chat with us" link for a number (digits are taken from the number). Null when the number is not known. */
export function buildChatLink(displayPhoneNumber: string | null): string | null {
  if (displayPhoneNumber === null) return null;
  const digits = displayPhoneNumber.replace(/\D/g, '');
  return digits === '' ? null : `https://wa.me/${digits}`;
}
