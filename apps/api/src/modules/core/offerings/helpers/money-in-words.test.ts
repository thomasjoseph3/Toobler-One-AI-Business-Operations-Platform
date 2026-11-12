import { describe, expect, it } from 'vitest';
import { describePriceInWords, formatRupees } from './money-in-words';

describe('formatRupees', () => {
  it('writes whole rupees the Indian way, with no ".00"', () => {
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(50_000)).toBe('₹500');
    expect(formatRupees(450_000)).toBe('₹4,500');
    expect(formatRupees(12_500_000)).toBe('₹1,25,000');
    expect(formatRupees(10_000_000_000)).toBe('₹10,00,00,000');
  });

  it('shows paise only when there are some', () => {
    expect(formatRupees(450_050)).toBe('₹4,500.50');
    expect(formatRupees(99)).toBe('₹0.99');
    expect(formatRupees(100_001)).toBe('₹1,000.01');
  });
});

describe('describePriceInWords', () => {
  it('says the from-price with the unit and the GST note, for each unit and mode', () => {
    expect(describePriceInWords({ fromPricePaise: 450_000, priceUnit: 'per night', gstMode: 'plus' })).toBe(
      'from ₹4,500 a night plus GST',
    );
    expect(describePriceInWords({ fromPricePaise: 120_000, priceUnit: 'per person', gstMode: 'included' })).toBe(
      'from ₹1,200 a person including GST',
    );
    expect(describePriceInWords({ fromPricePaise: 5_000_000, priceUnit: 'per package', gstMode: 'none' })).toBe(
      'from ₹50,000 a package with no GST',
    );
    expect(describePriceInWords({ fromPricePaise: 30_000, priceUnit: 'per visit', gstMode: 'plus' })).toBe(
      'from ₹300 a visit plus GST',
    );
    expect(describePriceInWords({ fromPricePaise: 80_000, priceUnit: 'per hour', gstMode: 'plus' })).toBe(
      'from ₹800 an hour plus GST',
    );
    expect(describePriceInWords({ fromPricePaise: 9_900, priceUnit: 'per item', gstMode: 'included' })).toBe(
      'from ₹99 an item including GST',
    );
  });

  it('uses a unit the business wrote in its own words, as written, and ignores capitals and spaces for the common ones', () => {
    expect(describePriceInWords({ fromPricePaise: 250_000, priceUnit: 'per trip', gstMode: 'plus' })).toBe(
      'from ₹2,500 per trip plus GST',
    );
    expect(describePriceInWords({ fromPricePaise: 450_000, priceUnit: '  Per Night ', gstMode: 'plus' })).toBe(
      'from ₹4,500 a night plus GST',
    );
  });

  it('says nothing when the business does not share a price, or the price is incomplete', () => {
    expect(describePriceInWords({ fromPricePaise: null, priceUnit: null, gstMode: null })).toBeNull();
    expect(describePriceInWords({ fromPricePaise: 450_000, priceUnit: null, gstMode: 'plus' })).toBeNull();
    expect(describePriceInWords({ fromPricePaise: 450_000, priceUnit: 'per night', gstMode: null })).toBeNull();
  });

  it('never works out a total: a price of zero is still just "from ₹0"', () => {
    expect(describePriceInWords({ fromPricePaise: 0, priceUnit: 'per visit', gstMode: 'none' })).toBe(
      'from ₹0 a visit with no GST',
    );
  });
});
