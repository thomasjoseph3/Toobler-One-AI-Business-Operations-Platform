// Reads what Meta delivers to the webhook and keeps only the customers' messages (delivery receipts and other changes are left out).
// Pure: no database. What Meta sends is not trusted: anything that is not the expected shape is skipped, never an error.

/** The longest message text we keep (WhatsApp itself allows 4096). */
const MOST_CHARACTERS_KEPT = 1500;

/** One message from a customer, in the shape the rest of the code uses. */
export interface IncomingWhatsappMessage {
  /** Meta's id of the message (`wamid...`): the same message delivered twice has the same id. */
  messageId: string;
  /** The customer's number as digits only (the form contacts use), like 919847012345. */
  fromPhoneKey: string;
  /** Meta's id of the business number the customer wrote to: finds the business. */
  phoneNumberId: string;
  /** The typed words (also a tapped button's words), or null for a photo, voice note, location and so on. */
  text: string | null;
}

type UnknownRecord = Record<string, unknown>;

/** True for a plain object. */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The words of one message, or null when it carries none (a photo, a voice note, a location...). */
function readText(message: UnknownRecord): string | null {
  let text: unknown;
  if (message['type'] === 'text' && isRecord(message['text'])) text = message['text']['body'];
  if (message['type'] === 'button' && isRecord(message['button'])) text = message['button']['text'];
  if (message['type'] === 'interactive' && isRecord(message['interactive'])) {
    const buttonReply = message['interactive']['button_reply'];
    const listReply = message['interactive']['list_reply'];
    if (isRecord(buttonReply)) text = buttonReply['title'];
    else if (isRecord(listReply)) text = listReply['title'];
  }
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().slice(0, MOST_CHARACTERS_KEPT);
  return trimmed === '' ? null : trimmed;
}

/** The customers' messages in one webhook delivery, in the order Meta sent them. */
export function parseMetaDelivery(body: unknown): IncomingWhatsappMessage[] {
  const found: IncomingWhatsappMessage[] = [];
  if (!isRecord(body) || !Array.isArray(body['entry'])) return found;
  for (const entry of body['entry']) {
    if (!isRecord(entry) || !Array.isArray(entry['changes'])) continue;
    for (const change of entry['changes']) {
      if (!isRecord(change) || change['field'] !== 'messages' || !isRecord(change['value'])) continue;
      const { value } = change;
      const metadata = value['metadata'];
      const phoneNumberId = isRecord(metadata) ? String(metadata['phone_number_id'] ?? '') : '';
      if (!/^[0-9]{5,30}$/.test(phoneNumberId) || !Array.isArray(value['messages'])) continue;
      for (const message of value['messages']) {
        if (!isRecord(message)) continue;
        const messageId = String(message['id'] ?? '');
        const fromPhoneKey = String(message['from'] ?? '');
        if (messageId === '' || messageId.length > 300 || !/^[0-9]{6,15}$/.test(fromPhoneKey)) continue;
        found.push({ messageId, fromPhoneKey, phoneNumberId, text: readText(message) });
      }
    }
  }
  return found;
}
