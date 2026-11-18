import { describe, expect, it } from 'vitest';
import {
  findDuplicateCompanyPairs,
  findDuplicateContactPairs,
  makeCompanyCoreName,
  makeEmailName,
  makeNameKey,
  phonesAreSimilar,
} from './find-duplicate-pairs';

describe('phonesAreSimilar', () => {
  it('matches the same last 10 digits with and without a country code', () => {
    expect(phonesAreSimilar('+919847012345', '+9847012345')).toBe(true); // one has the country code, one has not
    expect(phonesAreSimilar('+919847012345', '+919847099999')).toBe(false);
    expect(phonesAreSimilar('+919847012345', '+449847012345')).toBe(true);
  });
  it('matches one different digit and nothing more', () => {
    expect(phonesAreSimilar('+919847012345', '+919847012346')).toBe(true);
    expect(phonesAreSimilar('+919847012345', '+919847012366')).toBe(false);
  });
  it('never matches a missing or tiny phone', () => {
    expect(phonesAreSimilar(null, '+919847012345')).toBe(false);
    expect(phonesAreSimilar('+123', '+123')).toBe(false);
  });
});

describe('name and email keys', () => {
  it('ignores capitals, spaces and dots', () => {
    expect(makeNameKey('Anil  K.')).toBe('anilk');
    expect(makeNameKey('Al')).toBe('');
    expect(makeNameKey(null)).toBe('');
  });
  it('ignores shared email names and short ones', () => {
    expect(makeEmailName('info@shop.com')).toBe('');
    expect(makeEmailName('ab@x.com')).toBe('');
    expect(makeEmailName('anil.k@x.com')).toBe('anil.k');
  });
  it('drops legal-form words from a company name', () => {
    expect(makeCompanyCoreName('Infosys Pvt. Ltd.')).toBe('infosys');
    expect(makeCompanyCoreName('Tata & Sons Limited')).toBe('tatasons');
  });
});

describe('findDuplicateContactPairs', () => {
  it('finds the same name with a similar phone', () => {
    const pairs = findDuplicateContactPairs([
      { id: 'b', name: 'Anil Kumar', phone: '+919847012345', email: null },
      { id: 'a', name: 'anil kumar', phone: '+919847012346', email: null },
      { id: 'c', name: 'Meera', phone: '+919847012345', email: null },
    ]);
    expect(pairs).toEqual([{ firstId: 'a', secondId: 'b', reasons: ['same_name_similar_phone'] }]);
  });
  it('finds the same name with the same email name on another domain, and joins reasons', () => {
    const pairs = findDuplicateContactPairs([
      { id: 'a', name: 'Anil Kumar', phone: '+919847012345', email: 'anil.k@work.com' },
      { id: 'b', name: 'Anil Kumar', phone: '+919847012346', email: 'anil.k@home.com' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.reasons).toEqual(
      expect.arrayContaining(['same_name_similar_phone', 'same_name_same_email_name', 'same_email_name_similar_phone']),
    );
  });
  it('does not pair different people who share only a phone or only a name', () => {
    expect(
      findDuplicateContactPairs([
        { id: 'a', name: 'Anil Kumar', phone: '+919847012345', email: null },
        { id: 'b', name: 'Anil Kumar', phone: '+919000000000', email: null },
        { id: 'c', name: 'Rahul Nair', phone: '+919847012345', email: null },
      ]),
    ).toEqual([]);
  });
  it('skips a placeholder name that too many contacts share', () => {
    const contacts = Array.from({ length: 201 }, (_, index) => ({
      id: `id-${String(index).padStart(3, '0')}`,
      name: 'Guest',
      phone: '+919847012345',
      email: null,
    }));
    expect(findDuplicateContactPairs(contacts)).toEqual([]);
  });
  it('handles 10,000 contacts quickly', () => {
    const contacts = Array.from({ length: 10_000 }, (_, index) => ({
      id: `id-${String(index).padStart(5, '0')}`,
      name: `Person ${index % 5000}`,
      phone: `+91${String(9000000000 + index)}`,
      email: `user${index}@example.com`,
    }));
    const startedAt = Date.now();
    findDuplicateContactPairs(contacts);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});

describe('findDuplicateCompanyPairs', () => {
  it('finds the same name without its legal form, and the same phone', () => {
    const pairs = findDuplicateCompanyPairs([
      { id: 'a', name: 'Infosys', phone: null },
      { id: 'b', name: 'Infosys Pvt Ltd', phone: '+918012345678' },
      { id: 'c', name: 'Other Firm', phone: '+918012345678' },
    ]);
    expect(pairs).toEqual([
      { firstId: 'a', secondId: 'b', reasons: ['same_name_without_suffix'] },
      { firstId: 'b', secondId: 'c', reasons: ['same_phone'] },
    ]);
  });
});
