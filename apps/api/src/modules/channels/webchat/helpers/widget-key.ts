import { randomBytes } from 'node:crypto';

// The widget key: the one thing a visitor's browser knows about the business. Long and random, so it cannot be guessed, but not a secret
// (it sits in the page's code), which is why the public chat routes also check the website a request comes from.

/** The shape of a key: `wk_` and 32 letters, digits, dashes or underscores. */
const WIDGET_KEY_PATTERN = /^wk_[A-Za-z0-9_-]{32}$/;

/** Makes a new key from 24 random bytes (192 bits). */
export function makeWidgetKey(): string {
  return `wk_${randomBytes(24).toString('base64url')}`;
}

/** True when the text has the shape of a key. A cheap check before any lookup, so junk never reaches the database. */
export function looksLikeWidgetKey(text: string): boolean {
  return WIDGET_KEY_PATTERN.test(text);
}
