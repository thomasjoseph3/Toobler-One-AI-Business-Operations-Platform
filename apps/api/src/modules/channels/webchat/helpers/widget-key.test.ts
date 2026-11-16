import { describe, expect, it } from 'vitest';
import { looksLikeWidgetKey, makeWidgetKey } from './widget-key';

describe('the widget key', () => {
  it('is made of wk_ and 32 letters, digits, dashes or underscores', () => {
    expect(makeWidgetKey()).toMatch(/^wk_[A-Za-z0-9_-]{32}$/);
  });

  it('is different every time', () => {
    const keys = new Set(Array.from({ length: 200 }, () => makeWidgetKey()));
    expect(keys.size).toBe(200);
  });

  it('recognises a key, and refuses junk before any lookup', () => {
    expect(looksLikeWidgetKey(makeWidgetKey())).toBe(true);
    for (const junk of [
      '',
      'wk_',
      'wk_short',
      `wk_${'a'.repeat(33)}`,
      `xx_${'a'.repeat(32)}`,
      `wk_${'a'.repeat(31)}!`,
      "wk_' OR 1=1 --",
    ]) {
      expect(looksLikeWidgetKey(junk), junk).toBe(false);
    }
  });
});
