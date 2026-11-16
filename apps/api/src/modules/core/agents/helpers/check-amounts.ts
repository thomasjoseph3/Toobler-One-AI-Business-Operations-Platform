// "The AI states facts; code decides": the agent never does maths and never says a total. This check catches an answer that has an
// amount of money in it that no source gave: the customer did not say it, no tool returned it, and it is not in the business's facts.
// A total the AI worked out ("3 nights = ₹12,000") is exactly such an amount. Pure: no database.

/** Said instead of an answer that still holds an amount nobody confirmed, after one chance to fix it. */
export const UNCONFIRMED_AMOUNT_REPLY =
  "I'd rather not quote a figure I can't confirm. Our team will confirm the exact amount when they get in touch.";

// An amount is a number next to a money word: ₹4,500 · Rs. 4500 · INR 4500 · 4500 rupees · 4500/-
const AMOUNT_BEFORE_WORD = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)/gi;
const AMOUNT_AFTER_WORD = /(\d[\d,]*(?:\.\d+)?)\s*(?:rupees?\b|\brs\b|\binr\b|\/-)/gi;
const ANY_NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** "4,500" as 4500, or undefined when it is not a number. */
function readNumber(text: string): number | undefined {
  const value = Number(text.replaceAll(',', ''));
  return Number.isFinite(value) ? value : undefined;
}

/** The amounts of money in a text, as numbers (4500 for "₹4,500"), without repeats. */
export function findAmountsInText(text: string): number[] {
  const amounts = new Set<number>();
  for (const pattern of [AMOUNT_BEFORE_WORD, AMOUNT_AFTER_WORD]) {
    for (const match of text.matchAll(pattern)) {
      const amount = readNumber(match[1] ?? '');
      if (amount !== undefined) amounts.add(amount);
    }
  }
  return [...amounts];
}

/** Every number written in the texts, money or not, as numbers. */
function findEveryNumber(texts: readonly string[]): Set<number> {
  const numbers = new Set<number>();
  for (const text of texts) {
    for (const match of text.matchAll(ANY_NUMBER)) {
      const value = readNumber(match[0]);
      if (value !== undefined) numbers.add(value);
    }
  }
  return numbers;
}

/**
 * The amounts in the reply that none of the sources has. `sources` are the texts the reply may legitimately draw on: what the
 * customer wrote, what the tools returned, and the business's own facts and prices.
 */
export function findUnbackedAmounts(reply: string, sources: readonly string[]): number[] {
  const backedNumbers = findEveryNumber(sources);
  return findAmountsInText(reply).filter((amount) => !backedNumbers.has(amount));
}

/** The note sent back to the model when its answer held amounts nobody confirmed. */
export function describeAmountCorrection(unbackedAmounts: readonly number[]): string {
  return (
    `Your answer contained ${unbackedAmounts.join(', ')}, which no tool gave and the customer did not say. ` +
    'Never work out a total, a sum or a discount. Say only prices exactly as the tools or the business facts give them, ' +
    'or say the team will confirm the amount. Write the answer again.'
  );
}
