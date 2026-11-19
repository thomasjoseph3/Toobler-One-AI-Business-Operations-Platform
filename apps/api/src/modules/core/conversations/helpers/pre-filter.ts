// Step 0 of sorting a conversation (docs/CONVERSATION-TYPES.md): cheap, certain rules in code, run BEFORE any AI is asked.
// When one matches, the type is decided and the AI is not used. Pure: no database, no AI, no clock.

/** Which way the person got in touch. The router never cares; the pre-filter does, because each way has its own signs of "nothing here". */
export type PreFilterChannel = 'phone' | 'whatsapp' | 'webchat' | 'email';

/** Everything the rules need to know, gathered by the caller (the engine) from the channel and from our own data. */
export interface PreFilterInput {
  channel: PreFilterChannel;
  /** Phone calls: how long the call lasted, in seconds, and whether the caller said anything. */
  callDurationSeconds?: number;
  callerSpoke?: boolean;
  /** Chats and WhatsApp: whether the conversation has ended, and how many messages the customer sent. */
  conversationEnded?: boolean;
  customerMessageCount?: number;
  /** Email: the headers of the message (any capitals in the names) and the sender's address. */
  emailHeaders?: Readonly<Record<string, string>>;
  /** Who is on the other end: a phone as digits only (the same form contacts use), or an email address. */
  phoneKey?: string | undefined;
  email?: string | undefined;
  /** The business's block list, and the phone numbers and emails of its own staff. Digits only for phones, lower case for emails. */
  blockedPhoneKeys: ReadonlySet<string>;
  blockedEmails: ReadonlySet<string>;
  staffPhoneKeys: ReadonlySet<string>;
  staffEmails: ReadonlySet<string>;
}

/** Why a rule matched, for the inbox and for tests. */
export type PreFilterReason = 'silent_call' | 'empty_chat' | 'automated_email' | 'blocked' | 'own_staff';

/** The type a rule decides, with the reason. The type keys are the system types every business has. */
export interface PreFilterResult {
  typeKey: 'no_conversation' | 'automated' | 'spam' | 'internal';
  reason: PreFilterReason;
}

/** A call shorter than this with no speech is silence, not a conversation. */
export const SILENT_CALL_SECONDS = 10;

/** Senders that are programs, not people: noreply@, no-reply@, donotreply@, mailer-daemon@, postmaster@, bounce@. */
const AUTOMATED_SENDER = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|bounces?)([-_.+].*)?$/i;

/** The values of the `Precedence` header that mean bulk mail. */
const BULK_PRECEDENCE = new Set(['bulk', 'junk', 'list']);

/** The headers with their names in lower case, so "Auto-Submitted" and "auto-submitted" are the same. */
function lowerCaseHeaderNames(headers: Readonly<Record<string, string>> | undefined): Map<string, string> {
  const result = new Map<string, string>();
  for (const [name, value] of Object.entries(headers ?? {})) result.set(name.toLowerCase(), value.trim());
  return result;
}

/** True when an email is machine-made: an Auto-Submitted header (other than "no"), a List-Unsubscribe header, bulk precedence, or a noreply sender. */
function isAutomatedEmail(input: PreFilterInput): boolean {
  const headers = lowerCaseHeaderNames(input.emailHeaders);
  const autoSubmitted = headers.get('auto-submitted');
  if (autoSubmitted !== undefined && autoSubmitted.toLowerCase() !== 'no') return true;
  if (headers.has('list-unsubscribe')) return true;
  const precedence = headers.get('precedence');
  if (precedence !== undefined && BULK_PRECEDENCE.has(precedence.toLowerCase())) return true;
  const senderName = (input.email ?? '').split('@')[0] ?? '';
  return AUTOMATED_SENDER.test(senderName);
}

/** True when the number or the email is in the given sets. */
function isIn(input: PreFilterInput, phoneKeys: ReadonlySet<string>, emails: ReadonlySet<string>): boolean {
  const phoneMatches = input.phoneKey !== undefined && phoneKeys.has(input.phoneKey);
  const emailMatches = input.email !== undefined && emails.has(input.email.trim().toLowerCase());
  return phoneMatches || emailMatches;
}

/**
 * Runs the rules in this order and stops at the first that matches: silence or an empty chat, then machine-made email, then the
 * business's block list, then the business's own staff. Returns the type to give the conversation, or null when no rule matches
 * (the AI is then asked).
 */
export function preFilter(input: PreFilterInput): PreFilterResult | null {
  if (input.channel === 'phone') {
    const wasShort = input.callDurationSeconds !== undefined && input.callDurationSeconds < SILENT_CALL_SECONDS;
    if (wasShort && input.callerSpoke !== true) return { typeKey: 'no_conversation', reason: 'silent_call' };
  } else if (input.channel === 'webchat' || input.channel === 'whatsapp') {
    if (input.conversationEnded === true && (input.customerMessageCount ?? 0) === 0) {
      return { typeKey: 'no_conversation', reason: 'empty_chat' };
    }
  } else if (input.channel === 'email' && isAutomatedEmail(input)) {
    return { typeKey: 'automated', reason: 'automated_email' };
  }
  if (isIn(input, input.blockedPhoneKeys, input.blockedEmails)) return { typeKey: 'spam', reason: 'blocked' };
  if (isIn(input, input.staffPhoneKeys, input.staffEmails)) return { typeKey: 'internal', reason: 'own_staff' };
  return null;
}
