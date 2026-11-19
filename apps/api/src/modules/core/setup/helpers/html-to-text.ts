// Turns a web page's HTML into plain text for the AI to read. Pure: no network, nothing is run. Ported from the hotel agent.

/** The longest text kept from the data a page's framework embeds for the browser. */
const MAX_EMBEDDED_TEXT_LENGTH = 8_000;

const NAMED_CHARACTERS: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  rarr: '→',
  times: '×',
  deg: '°',
  rupee: '₹',
};

/** Replaces HTML character codes (&amp; &#8377; &#x20B9;) with the characters they stand for. An unknown name is left as written. */
export function decodeHtmlCharacters(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const isHexadecimal = code[1]!.toLowerCase() === 'x';
      const codePoint = isHexadecimal ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint < 0x110000 ? String.fromCodePoint(codePoint) : '';
    }
    return NAMED_CHARACTERS[code.toLowerCase()] ?? whole;
  });
}

/** The value of one attribute of an HTML tag ("" when it has none), with character codes decoded. */
export function readTagAttribute(tag: string, attributeName: string): string {
  const match = new RegExp(`\\s${attributeName}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? decodeHtmlCharacters(match[2] ?? match[3] ?? match[4] ?? '').trim() : '';
}

/** The visible text of some HTML, one block per line. Scripts, styles and other hidden parts are dropped. */
export function htmlToText(html: string): string {
  const lines = decodeHtmlCharacters(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|head|canvas|select)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      // One the size limit cut off before it closed: the rest of the page is its code, not text
      .replace(/<(script|style|noscript|svg|template|iframe|head|canvas|select)\b[\s\S]*$/i, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(
        /<\/?(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|h[1-6]|tr|td|th|table|dt|dd|blockquote|figure|figcaption|address|label|button)\b[^>]*>/gi,
        '\n',
      )
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.filter((line, position) => line !== lines[position - 1]).join('\n');
}

// ---------- what a site built in the browser embeds in its page ----------

const FRAMEWORK_STATE_MARKER =
  /__NEXT_DATA__|__NUXT__|__NUXT_DATA__|__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__|__remixContext|window\.__[A-Z_]+__\s*=/;

/** Whether a string from a page's data reads like something a person would see: words, a phone number or an email. */
function looksLikeVisibleText(candidate: string): boolean {
  if (
    candidate.length < 4 ||
    candidate.length > 1500 ||
    /^(https?:|\/|\.|#|data:|rgba?\()/i.test(candidate) ||
    /[{}<>]|\\u[0-9a-f]{4}/i.test(candidate)
  ) {
    return false;
  }
  if (/^\+?[\d\s\-()]{7,20}$/.test(candidate) || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(candidate)) return true;
  if (!/\p{L}{2,}\s+\S{2,}/u.test(candidate)) return false;
  // Not CSS class names ("flex items-center gap-2") or code
  const words = candidate.split(/\s+/);
  const codeLikeWords = words.filter((word) => /^[a-z0-9]+([-:_/.[\]][a-z0-9[\]]+)+$/.test(word)).length;
  return !(codeLikeWords >= words.length / 2 && !/[A-Z]/.test(candidate));
}

/** Collects every string in some parsed JSON, depth first, within limits. */
function collectStrings(value: unknown, collected: string[], depth = 0): void {
  if (collected.length > 5000 || depth > 40) return;
  if (typeof value === 'string') collected.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, collected, depth + 1);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) collectStrings(item, collected, depth + 1);
}

/**
 * The text in the data a page's framework embeds for the browser: JSON script tags (Next.js and others) and the state some
 * frameworks set in a script (Nuxt, Redux, Apollo), read as data, never run. Each string once, in page order.
 */
export function readEmbeddedPageText(html: string): string {
  const collected: string[] = [];
  for (const scriptMatch of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const tagAttributes = scriptMatch[1] ?? '';
    const scriptBody = scriptMatch[2] ?? '';
    if (/ld\+json/i.test(tagAttributes) || /\ssrc\s*=/i.test(tagAttributes)) continue;
    const isJson = /application\/json/i.test(tagAttributes);
    if (!isJson && !FRAMEWORK_STATE_MARKER.test(scriptBody)) continue;
    let parsed: unknown;
    if (isJson) {
      try {
        parsed = JSON.parse(scriptBody);
      } catch {
        parsed = undefined;
      }
    }
    if (parsed !== undefined) {
      collectStrings(parsed, collected);
    } else {
      for (const quoted of scriptBody.matchAll(/"((?:[^"\\\n]|\\.){4,1500})"/g)) {
        try {
          collected.push(JSON.parse(`"${quoted[1]}"`) as string);
        } catch {
          // not a plain string literal
        }
        if (collected.length > 5000) break;
      }
    }
  }
  const visibleStrings = collected
    .map((text) =>
      decodeHtmlCharacters(text.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(looksLikeVisibleText);
  return [...new Set(visibleStrings)].join('\n').slice(0, MAX_EMBEDDED_TEXT_LENGTH);
}
