import { describe, expect, it } from 'vitest';
import { isPublicAddress, parseWebsiteAddress } from './public-address';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '142.250.183.46', '2606:4700:4700::1111'])('accepts the public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // the cloud metadata address
    '100.64.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
  ])('refuses the non-public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it('checks an IPv4 address written as IPv6 as IPv4', () => {
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });

  it('refuses anything that is not an IP address, including odd spellings of one', () => {
    expect(isPublicAddress('localhost')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
    expect(isPublicAddress('0x7f.1')).toBe(false);
    expect(isPublicAddress('2130706433')).toBe(false); // 127.0.0.1 as one number
    expect(isPublicAddress('[::1]')).toBe(false);
  });
});

describe('parseWebsiteAddress', () => {
  it('adds https:// to a bare name and drops the #part', () => {
    expect(parseWebsiteAddress('lakeside.in').href).toBe('https://lakeside.in/');
    expect(parseWebsiteAddress('  https://www.lakeside.in/about#team ').href).toBe('https://www.lakeside.in/about');
    expect(parseWebsiteAddress('http://lakeside.in:80/').hostname).toBe('lakeside.in');
  });

  it.each([
    'ftp://lakeside.in',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:secret@lakeside.in',
    'https://lakeside.in:8080',
    'https://lakeside.in:22',
    'http://127.0.0.1',
    'http://localhost',
    'http://localhost:3000',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.1',
    'http://0x7f.0.0.1',
    'http://2130706433',
    'http://127.1',
    'https://printer.local',
    'https://admin.internal',
    'https://intranet',
  ])('refuses %s', (typed) => {
    expect(() => parseWebsiteAddress(typed)).toThrow();
  });

  it('refuses nothing-like-an-address and non-text', () => {
    expect(() => parseWebsiteAddress('')).toThrow();
    expect(() => parseWebsiteAddress(undefined)).toThrow();
    expect(() => parseWebsiteAddress('not a url at all')).toThrow();
  });

  it('refuses with a code the screen can use', () => {
    expect(() => parseWebsiteAddress('http://127.0.0.1')).toThrowError(expect.objectContaining({ code: 'WEBSITE_NOT_PUBLIC' }));
    expect(() => parseWebsiteAddress('ftp://x.in')).toThrowError(expect.objectContaining({ code: 'WEBSITE_ADDRESS_INVALID' }));
  });

  it('accepts an extra port only when the caller allows it (tests only)', () => {
    expect(() => parseWebsiteAddress('https://lakeside.in:8443')).toThrow();
    expect(parseWebsiteAddress('https://lakeside.in:8443', { allowedPorts: ['443', '8443'] }).port).toBe('8443');
  });
});
