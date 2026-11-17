import { describe, expect, it } from 'vitest';
import { readListingSearchText } from './read-listing-query';

describe('readListingSearchText', () => {
  it('uses a typed name as it is, tidying the spaces', () => {
    expect(readListingSearchText('  Nair   Stays  Kovalam ')).toBe('Nair Stays Kovalam');
  });

  it('reads the name out of a long Google Maps link, without fetching it', () => {
    expect(readListingSearchText('https://www.google.com/maps/place/Nair+Stays+Kovalam/@8.4,76.9,17z/data=!3m1')).toBe('Nair Stays Kovalam');
    expect(readListingSearchText('https://www.google.co.in/maps/place/Caf%C3%A9+Rio/@1,2')).toBe('Café Rio');
  });

  it.each([
    'https://maps.app.goo.gl/abc123',
    'https://goo.gl/maps/xyz',
    'https://evil.example/maps/place/Nair',
    'http://169.254.169.254/maps/place/x',
    'https://www.google.com/search?q=hotel',
    'https://www.google.com/maps/place/',
    'ftp://www.google.com/maps/place/Nair',
    'https://www.google.com/maps/place/%E0%A4%A/@1',
  ])('refuses %s', (typed) => {
    expect(() => readListingSearchText(typed)).toThrowError(expect.objectContaining({ code: 'LISTING_NOT_SUPPORTED' }));
  });
});
