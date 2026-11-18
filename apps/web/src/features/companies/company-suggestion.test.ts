import { describe, expect, it } from 'vitest';
import { findSuggestionDomain } from './company-suggestion';

describe('findSuggestionDomain', () => {
  it('gives the work domain of an email, in lower case', () => {
    expect(findSuggestionDomain('Priya@Infosys.com')).toBe('infosys.com');
  });

  it('gives nothing for free email services, no email, or a badly written one', () => {
    expect(findSuggestionDomain('priya@gmail.com')).toBeNull();
    expect(findSuggestionDomain('priya@Yahoo.co.in')).toBeNull();
    expect(findSuggestionDomain(null)).toBeNull();
    expect(findSuggestionDomain('priya')).toBeNull();
    expect(findSuggestionDomain('@infosys.com')).toBeNull();
  });
});
