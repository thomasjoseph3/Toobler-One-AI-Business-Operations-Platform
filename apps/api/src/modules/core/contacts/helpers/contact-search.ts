// Turns what staff type in the search box into what the database should look for. Pure logic, no database.

/** What to look for: either part of a phone number, or a piece of text in the name or email. Never both. */
export type ContactSearch = { kind: 'phone'; digits: string } | { kind: 'text'; likePattern: string };

/** Puts a backslash before the characters that mean something to LIKE (`%`, `_` and `\`), so they are searched for literally. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Reads the search box. Blank means no search (null). Something made only of digits, spaces and phone punctuation, with at
 * least 3 digits, is searched as a phone number: its digits (leading zeros dropped, since "098470" is how a local number
 * starts) are matched inside the stored international digits. Anything else is searched in the name and email.
 */
export function readSearchText(typedText: string | undefined): ContactSearch | null {
  const trimmed = (typedText ?? '').trim();
  if (trimmed === '') return null;
  if (/^[\d\s+().-]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length >= 3) return { kind: 'phone', digits };
  }
  return { kind: 'text', likePattern: `%${escapeLikePattern(trimmed)}%` };
}
