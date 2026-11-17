import { describe, expect, it } from 'vitest';
import {
  choosePagesWorthReading,
  isSameSite,
  isSitemapOfBusinessPages,
  pageKeyOf,
  readSitemapAddresses,
} from './choose-pages-to-read';

const HOME = 'https://www.nairstays.example/';
const link = (path: string, label = '') => ({ url: `https://nairstays.example${path}`, label });

describe('choosePagesWorthReading', () => {
  it('picks contact, about and FAQ first, then service pages, never the home page or a duplicate', () => {
    const chosen = choosePagesWorthReading(HOME, [
      link('/'),
      link('/rooms'),
      link('/about-us'),
      link('/contact/'),
      link('/contact'),
      link('/faq'),
      link('/random-page'),
    ]);
    expect(chosen).toEqual([
      'https://nairstays.example/about-us',
      'https://nairstays.example/contact/',
      'https://nairstays.example/faq',
      'https://nairstays.example/rooms',
    ]);
  });

  it('leaves out other sites, files, posts, privacy pages, shop and account pages', () => {
    const chosen = choosePagesWorthReading(HOME, [
      { url: 'https://other.example/contact', label: '' },
      link('/brochure-about.pdf'),
      link('/blog/about-our-story'),
      link('/privacy-policy'),
      link('/cart'),
      link('/login'),
      { url: 'mailto:x@y.in', label: 'contact' },
      { url: 'not a url', label: 'contact' },
    ]);
    expect(chosen).toEqual([]);
  });

  it('uses the link words when the address says nothing, and prefers shallow pages', () => {
    const chosen = choosePagesWorthReading(HOME, [
      link('/p', 'Contact us'),
      link('/a/b/c/d/e/f', 'About'),
      link('/xyz', 'Our services'),
    ]);
    // "Contact us" scores higher than "Our services"; the page six levels deep is not worth reading at all
    expect(chosen).toEqual(['https://nairstays.example/p', 'https://nairstays.example/xyz']);
  });

  it('stays inside one part of a group site and stops at the maximum', () => {
    const inBranch = choosePagesWorthReading('https://group.example/kochi', [
      { url: 'https://group.example/kochi/contact', label: '' },
      { url: 'https://group.example/goa/contact', label: '' },
    ]);
    expect(inBranch).toEqual(['https://group.example/kochi/contact']);
    const many = Array.from({ length: 30 }, (_, number) => link(`/contact-${number}`));
    expect(choosePagesWorthReading(HOME, many)).toHaveLength(7);
    expect(choosePagesWorthReading(HOME, many, 3)).toHaveLength(3);
  });
});

describe('sitemap helpers', () => {
  it('reads addresses from a sitemap, including CDATA and character codes', () => {
    const xml = `<urlset><url><loc>https://a.example/contact</loc></url><url><loc><![CDATA[https://a.example/about?x=1&amp;y=2]]></loc></url></urlset>`;
    expect(readSitemapAddresses(xml)).toEqual(['https://a.example/contact', 'https://a.example/about?x=1&y=2']);
  });

  it('knows which sub-sitemaps are the business pages', () => {
    expect(isSitemapOfBusinessPages('https://a.example/page-sitemap.xml')).toBe(true);
    expect(isSitemapOfBusinessPages('https://a.example/post-sitemap.xml')).toBe(false);
    expect(isSitemapOfBusinessPages('https://a.example/product-sitemap.xml')).toBe(false);
  });

  it('treats www and a trailing slash as the same page', () => {
    expect(pageKeyOf(new URL('https://www.a.example/x/'))).toBe(pageKeyOf(new URL('https://a.example/x')));
    expect(isSameSite(new URL('https://www.a.example'), new URL('https://a.example'))).toBe(true);
    expect(isSameSite(new URL('https://a.example'), new URL('https://b.example'))).toBe(false);
  });
});
