// Reading an email: pure helpers with no network and no database, ported from the hotel agent's mailbox reader. They turn raw header lines and
// message parts into the plain facts the rest of the app needs. What an email says is written by someone outside the business: it is data.

/** The most characters of an email's text we keep. */
export const MOST_CHARACTERS_OF_EMAIL_TEXT = 30_000;

/**
 * The raw header lines as `{ name: value }` (lower-case names, folded lines joined). Of a repeated header the FIRST is kept: the top one,
 * added by the server that received the email last (ours), not by the sender.
 */
export function parseHeaders(rawHeaders: string | Buffer | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  const text = String(rawHeaders ?? '').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of text.split(/\r?\n/)) {
    const colonAt = line.indexOf(':');
    if (colonAt > 0) {
      const name = line.slice(0, colonAt).trim().toLowerCase();
      if (!(name in headers)) headers[name] = line.slice(colonAt + 1).trim();
    }
  }
  return headers;
}

/** Whether `domain` is the sender's domain or shares it (mail.example.com and example.com), as DMARC aligns them. */
function isAligned(domain: string | undefined, fromDomain: string): boolean {
  if (!domain) return false;
  return domain === fromDomain || fromDomain.endsWith(`.${domain}`) || domain.endsWith(`.${fromDomain}`);
}

/** The result of the sender check. */
export type SenderCheck = 'pass' | 'fail' | 'none';

/**
 * Whether the email really comes from `fromAddress`, from the check OUR mail server made when it arrived (its Authentication-Results
 * header): `pass` when DMARC passed, or DKIM or SPF passed for the sender's own domain; `fail` when DMARC failed or nothing passed; `none`
 * when there is no check to read. From Gmail only Gmail's own (mx.google.com) is trusted: a sender can write any header below it.
 */
export function checkSender(headers: Record<string, string>, fromAddress: string, imapHost: string): SenderCheck {
  const value = headers['authentication-results'];
  if (!value) return 'none';
  const [server = '', ...results] = value.split(';').map((part) => part.trim());
  if (/(^|\.)(gmail|googlemail)\.com$/i.test(imapHost) && server.toLowerCase() !== 'mx.google.com') return 'none';
  const fromDomain = (fromAddress.split('@').pop() ?? '').toLowerCase();
  const found = results.map((result) => {
    const methodMatch = /^(\w+)\s*=\s*(\w+)/.exec(result);
    const readProperty = (name: string): string | undefined => {
      const propertyMatch = new RegExp(`${name}=([^\\s;]+)`, 'i').exec(result);
      return propertyMatch?.[1]?.toLowerCase().replace(/^.*@/, '');
    };
    return {
      method: methodMatch?.[1]?.toLowerCase(),
      result: methodMatch?.[2]?.toLowerCase(),
      domain: readProperty('header\\.d') ?? readProperty('header\\.i') ?? readProperty('smtp\\.mailfrom'),
    };
  });
  const dmarc = found.find((entry) => entry.method === 'dmarc');
  if (dmarc?.result === 'pass') return 'pass';
  if (dmarc?.result === 'fail') return 'fail';
  const passedForSender = found.some(
    (entry) =>
      (entry.method === 'dkim' || entry.method === 'spf') &&
      entry.result === 'pass' &&
      isAligned(entry.domain, fromDomain),
  );
  if (passedForSender) return 'pass';
  return found.some((entry) => entry.method === 'dkim' || entry.method === 'spf') ? 'fail' : 'none';
}

/** The message ids (`<...>`) in a References or In-Reply-To header, in order. */
export function readMessageIds(value: string | undefined): string[] {
  return String(value ?? '').match(/<[^<>\s]+>/g) ?? [];
}

/** Mailing lists, newsletters, notifications, receipts and bounces: nobody to answer. Decided from the headers and the sender's address. */
export function isAutomatedEmail(headers: Record<string, string>, fromAddress: string): boolean {
  if (headers['list-unsubscribe'] || headers['list-id']) return true;
  const autoSubmitted = headers['auto-submitted'];
  if (autoSubmitted && !/^no$/i.test(autoSubmitted)) return true;
  if (/^(bulk|list|junk)$/i.test(headers['precedence'] ?? '')) return true;
  return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce)[^@]*@/i.test(fromAddress);
}

/** HTML as plain text: line breaks kept, tags and the common entities removed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The new part of an email: the quoted earlier messages ("On … wrote:", "> …", "-----Original Message-----") are cut off. */
export function withoutQuotedText(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineWithNext = `${line} ${lines[index + 1] ?? ''}`.trim();
    if (
      /^-{2,}\s*Original Message\s*-{2,}/i.test(line) ||
      /^On .{4,200}wrote:\s*$/i.test(line) ||
      /^On .{4,200}wrote:\s*$/i.test(lineWithNext)
    ) {
      break;
    }
    if (/^From: .+$/i.test(line) && /^(Sent|Date): /i.test(lines[index + 1] ?? '')) break;
    if (line.startsWith('>')) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

/** The part of a message structure to read: the plain-text part, else the HTML one. Null when there is none. */
export interface BodyStructureNode {
  childNodes?: BodyStructureNode[];
  disposition?: string;
  type?: string;
  part?: string;
}
export function chooseTextPart(root: BodyStructureNode | undefined): { part: string; isHtml: boolean } | null {
  const leaves: BodyStructureNode[] = [];
  const walk = (node: BodyStructureNode | undefined): void => {
    if (!node) return;
    if (node.childNodes?.length) node.childNodes.forEach(walk);
    else if (node.disposition !== 'attachment') leaves.push(node);
  };
  walk(root);
  const plain = leaves.find((leaf) => leaf.type === 'text/plain');
  const html = leaves.find((leaf) => leaf.type === 'text/html');
  const chosen = plain ?? html;
  return chosen ? { part: chosen.part || '1', isHtml: !plain } : null;
}

/** The reply as an email: the AI's markdown turned into plain text (no stray ** or #). */
export function toPlainEmailText(reply: string): string {
  return reply
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/__([^_\n]+)__/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/** The subject for a reply: "Re: " once, never "Re: Re:". */
export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  if (trimmed === '') return 'Re: your enquiry';
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}
