import { isFreeMailDomain, readEmailDomain } from '@toobler-one/shared';

/**
 * The work domain of a contact's email ("priya@infosys.com" gives "infosys.com"), or null when there is nothing to suggest a company from: no
 * email, a badly written one, or a free email service (gmail.com and the like say nothing about a firm).
 */
export function findSuggestionDomain(email: string | null): string | null {
  if (email === null) return null;
  const domain = readEmailDomain(email);
  if (domain === null || isFreeMailDomain(domain)) return null;
  return domain;
}
