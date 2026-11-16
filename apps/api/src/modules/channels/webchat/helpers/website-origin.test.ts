import { describe, expect, it } from 'vitest';
import { isWebsiteAllowed, readWebsiteOrigin, readWebsiteOrigins } from './website-origin';

describe('readWebsiteOrigin (a typed website, as the address a browser sends)', () => {
  it('tidies a website to its address: lower case, no trailing slash, usual ports left out', () => {
    expect(readWebsiteOrigin('https://NairStays.Example/')).toEqual({ ok: true, origin: 'https://nairstays.example' });
    expect(readWebsiteOrigin('  https://nairstays.example  ')).toEqual({
      ok: true,
      origin: 'https://nairstays.example',
    });
    expect(readWebsiteOrigin('https://nairstays.example:443')).toEqual({
      ok: true,
      origin: 'https://nairstays.example',
    });
    expect(readWebsiteOrigin('http://localhost:5173')).toEqual({ ok: true, origin: 'http://localhost:5173' });
    expect(readWebsiteOrigin('https://www.nairstays.example')).toEqual({
      ok: true,
      origin: 'https://www.nairstays.example',
    });
  });

  it('keeps a different port, subdomain or scheme as a different website', () => {
    expect(readWebsiteOrigin('https://nairstays.example:8443')).toEqual({
      ok: true,
      origin: 'https://nairstays.example:8443',
    });
    expect(readWebsiteOrigin('http://nairstays.example')).toEqual({ ok: true, origin: 'http://nairstays.example' });
  });

  it('refuses a wildcard, a page, a query, an address with a password, and anything that is not http or https', () => {
    const refused = [
      'https://*.nairstays.example',
      '*',
      'https://nairstays.example/contact',
      'https://nairstays.example/?a=1',
      'https://nairstays.example/#top',
      'https://user:secret@nairstays.example',
      'ftp://nairstays.example',
      'javascript:alert(1)',
      'nairstays.example',
      '',
      'not a website',
    ];
    for (const typed of refused) {
      const result = readWebsiteOrigin(typed);
      expect(result.ok, typed).toBe(false);
    }
  });

  it('says what is wrong in words the business can act on', () => {
    const page = readWebsiteOrigin('https://nairstays.example/contact');
    expect(page.ok === false && page.problem).toContain('without a page, like https://nairstays.example');
    const wildcard = readWebsiteOrigin('https://*.example.com');
    expect(wildcard.ok === false && wildcard.problem).toContain('wildcards are not allowed');
  });
});

describe('readWebsiteOrigins', () => {
  it('lists each website once, in the order given, and stops at the first problem', () => {
    expect(readWebsiteOrigins(['https://a.example', 'https://A.example/', 'https://b.example'])).toEqual({
      ok: true,
      origins: ['https://a.example', 'https://b.example'],
    });
    expect(readWebsiteOrigins(['https://a.example', 'nope']).ok).toBe(false);
    expect(readWebsiteOrigins([])).toEqual({ ok: true, origins: [] });
  });
});

describe('isWebsiteAllowed', () => {
  const allowed = ['https://nairstays.example'];

  it('allows exactly the listed websites', () => {
    expect(isWebsiteAllowed('https://nairstays.example', allowed)).toBe(true);
  });

  it('refuses another website, a look-alike, another scheme or port, and a missing origin', () => {
    for (const origin of [
      'https://evil.example',
      'https://nairstays.example.evil.example',
      'https://evil-nairstays.example',
      'http://nairstays.example',
      'https://nairstays.example:8443',
      'https://sub.nairstays.example',
      'null',
      '',
      undefined,
    ]) {
      expect(isWebsiteAllowed(origin, allowed), String(origin)).toBe(false);
    }
  });

  it('allows nothing when the business listed no website', () => {
    expect(isWebsiteAllowed('https://nairstays.example', [])).toBe(false);
  });
});
