import { describe, expect, it } from 'vitest';
import { escapeLikePattern, readSearchText } from './contact-search';

describe('readSearchText', () => {
  it('means no search for blank or missing text', () => {
    expect(readSearchText(undefined)).toBeNull();
    expect(readSearchText('')).toBeNull();
    expect(readSearchText('   ')).toBeNull();
  });
  it('searches a phone-like text by its digits, dropping leading zeros', () => {
    expect(readSearchText('98470 12345')).toEqual({ kind: 'phone', digits: '9847012345' });
    expect(readSearchText('098470-12345')).toEqual({ kind: 'phone', digits: '9847012345' });
    expect(readSearchText('+91 98470')).toEqual({ kind: 'phone', digits: '9198470' });
  });
  it('searches names and emails as text', () => {
    expect(readSearchText('priya')).toEqual({ kind: 'text', likePattern: '%priya%' });
    expect(readSearchText('priya98')).toEqual({ kind: 'text', likePattern: '%priya98%' });
    expect(readSearchText('a@b.com')).toEqual({ kind: 'text', likePattern: '%a@b.com%' });
  });
  it('treats very short digit runs as text, so "12" does not match half the book', () => {
    expect(readSearchText('12')).toEqual({ kind: 'text', likePattern: '%12%' });
  });
  it('searches for % _ and \\ literally', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(readSearchText('100%')).toEqual({ kind: 'text', likePattern: '%100\\%%' });
  });
});
