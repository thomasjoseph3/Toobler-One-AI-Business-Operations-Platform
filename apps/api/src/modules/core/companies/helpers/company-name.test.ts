import { describe, expect, it } from 'vitest';
import { makeCompanyNameKey } from './company-name';

describe('makeCompanyNameKey', () => {
  it('ignores capital letters and every kind of space', () => {
    expect(makeCompanyNameKey('Infosys HR')).toBe('infosyshr');
    expect(makeCompanyNameKey('  infosys   hr ')).toBe('infosyshr');
    expect(makeCompanyNameKey('InfosysHR')).toBe('infosyshr');
    expect(makeCompanyNameKey('Infosys\tHR')).toBe('infosyshr');
  });

  it('keeps letters from other scripts', () => {
    expect(makeCompanyNameKey('നായർ സ്റ്റേയ്സ്')).toBe('നായർസ്റ്റേയ്സ്');
  });
});
