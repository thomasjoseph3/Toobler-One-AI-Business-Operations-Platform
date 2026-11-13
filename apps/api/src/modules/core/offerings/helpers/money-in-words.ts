import type { GstMode } from '@toobler-one/shared';

// Money in words, the way the AI says it. Pure: no database. The AI states a "from" price with its GST note and nothing else:
// nothing here multiplies, adds GST or works out a total.

/** The words that follow the price for the common units: "from ₹4,500 a night". */
const UNIT_PHRASES: Readonly<Record<string, string>> = {
  'per night': 'a night',
  'per person': 'a person',
  'per package': 'a package',
  'per visit': 'a visit',
  'per hour': 'an hour',
  'per item': 'an item',
};

/** The GST note that ends the sentence. */
const GST_PHRASES: Readonly<Record<GstMode, string>> = {
  included: 'including GST',
  plus: 'plus GST',
  none: 'with no GST',
};

/**
 * Paise as rupees in the Indian way of writing numbers: 450000 becomes "₹4,500", 12500000 becomes "₹1,25,000", and
 * 450050 becomes "₹4,500.50". Whole rupees never show ".00".
 */
export function formatRupees(paise: number): string {
  const hasPaise = paise % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(paise / 100);
}

/**
 * The price as the AI says it, for example "from ₹4,500 a night plus GST". Returns null when the offering has no price (the
 * business does not share one). A unit written in the business's own words ("per trip") is used as written.
 */
export function describePriceInWords(offering: {
  fromPricePaise: number | null;
  priceUnit: string | null;
  gstMode: GstMode | null;
}): string | null {
  if (offering.fromPricePaise === null || offering.priceUnit === null || offering.gstMode === null) return null;
  const unitWords = UNIT_PHRASES[offering.priceUnit.trim().toLowerCase()] ?? offering.priceUnit.trim();
  return `from ${formatRupees(offering.fromPricePaise)} ${unitWords} ${GST_PHRASES[offering.gstMode]}`;
}
