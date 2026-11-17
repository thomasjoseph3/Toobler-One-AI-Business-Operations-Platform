import { describe, expect, it } from 'vitest';
import { decodeHtmlCharacters, htmlToText, readEmbeddedPageText, readTagAttribute } from './html-to-text';

describe('decodeHtmlCharacters', () => {
  it('decodes named, decimal and hexadecimal codes, and leaves unknown names alone', () => {
    expect(decodeHtmlCharacters('Tea &amp; coffee &#8377;500 &#x20B9;600 &unknownname;')).toBe(
      'Tea & coffee ₹500 ₹600 &unknownname;',
    );
  });

  it('drops a code that is not a real character', () => {
    expect(decodeHtmlCharacters('a&#0;b&#99999999;c')).toBe('abc');
  });
});

describe('readTagAttribute', () => {
  it('reads double-quoted, single-quoted and bare values, and gives "" when missing', () => {
    expect(readTagAttribute('<a href="/contact?a=1&amp;b=2">', 'href')).toBe('/contact?a=1&b=2');
    expect(readTagAttribute("<a href='/about'>", 'href')).toBe('/about');
    expect(readTagAttribute('<a href=/faq class=x>', 'href')).toBe('/faq');
    expect(readTagAttribute('<a class="x">', 'href')).toBe('');
  });
});

describe('htmlToText', () => {
  it('gives the visible text, one block per line', () => {
    const html =
      '<html><head><title>Hidden title</title></head><body><h1>Nair Stays</h1><p>Six rooms<br>by the beach</p></body></html>';
    expect(htmlToText(html)).toBe('Nair Stays\nSix rooms\nby the beach');
  });

  it('drops scripts, styles, comments and an unfinished script cut off by the size limit', () => {
    const html =
      '<p>Open daily</p><script>var secret = 1;</script><style>p{color:red}</style><!-- note --><p>9 to 9</p><script>var cutOff = "';
    expect(htmlToText(html)).toBe('Open daily\n9 to 9');
  });

  it('collapses spaces and repeated lines', () => {
    expect(htmlToText('<p>Call   us</p><p>Call us</p><p>Now</p>')).toBe('Call us\nNow');
  });

  it('does not run or follow anything: tags are only removed', () => {
    expect(htmlToText('<p onclick="steal()">Hello <img src="http://169.254.169.254/x"></p>')).toBe('Hello');
  });
});

describe('readEmbeddedPageText', () => {
  it('reads text from framework data in a JSON script, and not code-like strings', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        about: 'We are a family run homestay near Kovalam',
        cssClass: 'flex items-center gap-2',
        phone: '+91 98470 12345',
        link: '/rooms',
      },
    })}</script>`;
    const text = readEmbeddedPageText(html);
    expect(text).toContain('We are a family run homestay near Kovalam');
    expect(text).toContain('+91 98470 12345');
    expect(text).not.toContain('flex items-center');
    expect(text).not.toContain('/rooms');
  });

  it('reads string values of a state set in a script, without running it', () => {
    const html = '<script>window.__INITIAL_STATE__ = {"address":"12 Beach Road, Kovalam","x":1};</script>';
    expect(readEmbeddedPageText(html)).toContain('12 Beach Road, Kovalam');
  });

  it('skips structured data (read elsewhere) and scripts loaded from an address', () => {
    const html =
      '<script type="application/ld+json">{"name":"Skipped Hotel Name"}</script><script src="/a.js" type="application/json"></script>';
    expect(readEmbeddedPageText(html)).toBe('');
  });

  it('gives each string once and stays within its limit', () => {
    const repeated = Array.from({ length: 2000 }, (_, number) => `Sentence number ${number} about the business`);
    const html = `<script type="application/json">${JSON.stringify([...repeated, ...repeated])}</script>`;
    const text = readEmbeddedPageText(html);
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(text.split('\n').filter((line) => line === 'Sentence number 0 about the business')).toHaveLength(1);
  });
});
