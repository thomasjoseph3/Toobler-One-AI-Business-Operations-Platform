import type { StructuredBusinessFacts } from './read-html-page';
import type { PrefilledAnswer } from '../../knowledge';

// Turns what a website states for search engines (schema.org) and its phone and email links into answers. Plain code, no AI:
// a number or address a site states about itself is better than one a model reads out of prose. Pure.

/** The answers the page's own data gives: the name, the address, and every phone number and email found. */
export function factsToAnswers(input: {
  facts: StructuredBusinessFacts;
  phones: readonly string[];
  emails: readonly string[];
}): PrefilledAnswer[] {
  const answers: PrefilledAnswer[] = [];
  if (input.facts.name) answers.push({ questionKey: 'business_name', value: input.facts.name });

  const address = input.facts.address;
  if (address) {
    const addressText = [address.line1, address.city, address.state, address.postalCode, address.country]
      .filter(Boolean)
      .join(', ');
    if (addressText) answers.push({ questionKey: 'address', value: addressText });
  }

  const phones = [...new Set([input.facts.phone, ...input.phones].filter((phone): phone is string => !!phone))];
  const emails = [...new Set([input.facts.email, ...input.emails].filter((email): email is string => !!email))];
  const rows = [
    ...phones.map((phone) => ({ kind: 'Phone', value: phone })),
    ...emails.map((email) => ({ kind: 'Email', value: email })),
  ].slice(0, 10);
  if (rows.length > 0) answers.push({ questionKey: 'contact_details', value: { rows } });
  return answers;
}
