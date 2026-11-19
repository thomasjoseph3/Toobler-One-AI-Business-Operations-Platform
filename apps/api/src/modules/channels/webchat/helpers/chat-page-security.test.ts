import { describe, expect, it } from 'vitest';
import { isOpenedAsFrame, isPlainFileName, makeChatPagePolicy } from './chat-page-security';

describe('makeChatPagePolicy', () => {
  it('lets only the listed websites frame the page, and allows nothing inline or from elsewhere', () => {
    const policy = makeChatPagePolicy(['https://a.example', 'https://b.example:8443']);
    expect(policy).toContain('frame-ancestors https://a.example https://b.example:8443');
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe-inline');
  });

  it('lets no website frame it when none is listed', () => {
    expect(makeChatPagePolicy([])).toContain("frame-ancestors 'none'");
  });
});

describe('isOpenedAsFrame', () => {
  it('accepts a frame, and a browser that does not say; refuses a page opened on its own', () => {
    expect(isOpenedAsFrame('iframe')).toBe(true);
    expect(isOpenedAsFrame(undefined)).toBe(true);
    expect(isOpenedAsFrame('document')).toBe(false);
    expect(isOpenedAsFrame('script')).toBe(false);
  });
});

describe('isPlainFileName', () => {
  it('accepts built file names and refuses anything that could leave the folder', () => {
    expect(isPlainFileName('chat-DbuLKo4c.js')).toBe(true);
    expect(isPlainFileName('style-wMfyrYj1.css')).toBe(true);
    for (const bad of ['..', '.env', '../x.js', 'a/b.js', 'a\\b.js', '', '%2e%2e', 'a b.js']) {
      expect(isPlainFileName(bad), bad).toBe(false);
    }
  });
});
