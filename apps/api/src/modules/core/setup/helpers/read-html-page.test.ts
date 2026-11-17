import { describe, expect, it } from 'vitest';
import { readHtmlPage, readStructuredBusinessFacts } from './read-html-page';

const BASE = 'https://nairstays.example/';

describe('readHtmlPage', () => {
  it('reads the title, description and visible text', () => {
    const html =
      '<html><head><title>Nair Stays | Kovalam</title><meta name="description" content="A family homestay by the sea"></head><body><h1>Welcome</h1><p>Six rooms</p></body></html>';
    const page = readHtmlPage(html, BASE);
    expect(page.title).toBe('Nair Stays | Kovalam');
    expect(page.text).toContain('A family homestay by the sea');
    expect(page.text).toContain('Welcome\nSix rooms');
  });

  it('collects phone, email, WhatsApp and map links, and keeps ordinary links with their words', () => {
    const html = `
      <a href="tel:+91%2098470%2012345">Call</a>
      <a href="mailto:hello@nairstays.example?subject=Hi">Mail</a>
      <a href="https://wa.me/919847012345">WhatsApp us</a>
      <a href="https://www.google.com/maps/place/Nair+Stays">Map</a>
      <a href="/contact">Contact us</a>
      <a href="javascript:void(0)">Nothing</a>`;
    const page = readHtmlPage(html, BASE);
    expect(page.phones).toEqual(['+91 98470 12345', '+919847012345']);
    expect(page.emails).toEqual(['hello@nairstays.example']);
    expect(page.mapLinks).toEqual(['https://www.google.com/maps/place/Nair+Stays']);
    expect(page.links).toEqual([{ url: 'https://nairstays.example/contact', label: 'Contact us' }]);
  });

  it('survives a badly escaped phone link and an unreadable address', () => {
    const page = readHtmlPage('<a href="tel:%E0%A4%A">bad</a><a href="http://">x</a>', BASE);
    expect(page.phones).toEqual(['%E0%A4%A']);
  });

  it('includes structured data in the text and reads the business facts from it', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: 'Nair Stays',
      telephone: '+91 98470 12345',
      email: 'mailto:hello@nairstays.example',
      address: {
        streetAddress: 'Beach Road',
        addressLocality: 'Kovalam',
        addressRegion: 'Kerala',
        postalCode: '695527',
        addressCountry: '107',
      },
      openingHours: ['Mo-Su 09:00-21:00'],
      hasMap: 'https://www.google.com/maps/place/Nair+Stays',
    })}</script><p>Hello</p>`;
    const page = readHtmlPage(html, BASE);
    expect(page.text).toContain('[structured data]');
    expect(page.facts).toEqual({
      name: 'Nair Stays',
      phone: '+91 98470 12345',
      email: 'hello@nairstays.example',
      address: { line1: 'Beach Road', city: 'Kovalam', state: 'Kerala', postalCode: '695527' },
      openingHours: 'Mo-Su 09:00-21:00',
      mapsUrl: 'https://www.google.com/maps/place/Nair+Stays',
    });
  });

  it('keeps the page text within its limit', () => {
    const html = `<p>${'word '.repeat(20_000)}</p>`;
    expect(readHtmlPage(html, BASE).text.length).toBeLessThanOrEqual(16_000);
  });
});

describe('readStructuredBusinessFacts', () => {
  it('finds a business nested in a graph, and the first one found wins field by field', () => {
    const block = JSON.stringify({
      '@graph': [
        { '@type': 'WebSite', name: 'Not a business' },
        { '@type': 'Clinic', name: 'First Clinic', telephone: '111' },
        { '@type': 'LocalBusiness', name: 'Second', email: 'second@x.in', telephone: '222' },
      ],
    });
    expect(readStructuredBusinessFacts([block])).toEqual({ name: 'First Clinic', phone: '111', email: 'second@x.in' });
  });

  it('reads opening hours from a specification, with 12-hour times', () => {
    const block = JSON.stringify({
      '@type': 'Dentist',
      openingHoursSpecification: [
        { dayOfWeek: ['https://schema.org/Monday', 'Tuesday'], opens: '9:00 AM', closes: '5:30 PM' },
      ],
    });
    expect(readStructuredBusinessFacts([block]).openingHours).toBe('Monday, Tuesday 09:00–17:30');
  });

  it('skips a block that is not valid JSON and a map link that is not a map', () => {
    const facts = readStructuredBusinessFacts([
      '{ "@type": "Store", broken',
      JSON.stringify({ '@type': 'Store', hasMap: 'https://evil.example' }),
    ]);
    expect(facts).toEqual({});
  });

  it('accepts an address written as one line', () => {
    expect(
      readStructuredBusinessFacts([JSON.stringify({ '@type': 'Store', address: ' 12 Main Road, Kochi ' })]).address,
    ).toEqual({
      line1: '12 Main Road, Kochi',
    });
  });
});
