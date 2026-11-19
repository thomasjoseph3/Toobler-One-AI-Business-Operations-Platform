import { MAX_UNANSWERED_QUESTION_LENGTH } from '@toobler-one/shared';

// Pure text tidying for the questions the AI could not answer. No database, no I/O.

// An email address, such as "asha@example.com"
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
// A run of digits that may start with + or a bracket and be split by spaces, dots, dashes or brackets, such as "+91 98765 43210"
const NUMBER_PATTERN = /[+(]?\d[\d\s().-]{5,}\d/g;
// A run with at least this many digits is treated as a phone number or an id, not as a quantity ("2 rooms", "4 nights")
const DIGITS_THAT_LOOK_LIKE_A_PHONE_NUMBER = 7;

/** Counts the digits in a piece of text. */
const countDigits = (text: string) => text.replace(/\D/g, '').length;

/**
 * Blanks out personal details a customer may have typed into a question: an email becomes "[email]" and a long run of digits
 * (7 or more, so a phone number but not "2 rooms") becomes "[number]". Returns the text with those parts replaced.
 */
export function blankOutPersonalDetails(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[email]')
    .replace(NUMBER_PATTERN, (match) =>
      countDigits(match) >= DIGITS_THAT_LOOK_LIKE_A_PHONE_NUMBER ? '[number]' : match,
    );
}

/**
 * Turns a question into the key used to group the same question asked again: lower case, letters and digits only, one space between
 * words. The marks that belong to letters (such as Malayalam and Hindi vowel signs) are kept, otherwise those words would fall apart.
 */
export function makeGroupKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prepares a question the AI could not answer for saving: extra spaces tidied, personal details blanked out, cut to the longest
 * length kept. Returns the question to show and the key to group it by, or null when nothing meaningful is left (an empty text).
 */
export function tidyUnansweredQuestion(rawText: string): { question: string; groupKey: string } | null {
  const question = blankOutPersonalDetails(rawText.replace(/\s+/g, ' ').trim())
    .slice(0, MAX_UNANSWERED_QUESTION_LENGTH)
    .trim();
  const groupKey = makeGroupKey(question);
  if (question === '' || groupKey === '') return null;
  return { question, groupKey };
}
