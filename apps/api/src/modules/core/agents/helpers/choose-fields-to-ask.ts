import type { FieldDefinition } from '@toobler-one/shared';

// Which of the business's own custom fields the AI asks about in a conversation. Pure: no database.

/** The most custom fields the AI asks about in one conversation, so a chat never becomes a form. */
export const MOST_FIELDS_ASKED_PER_CONVERSATION = 3;

/**
 * The fields the AI asks about: the ones marked "AI should ask" on contacts and leads (the two records a conversation makes), contacts first,
 * each in the order the business arranged them, at most three in all. The same fields come out every time for the same business, so a
 * conversation keeps asking the same ones. Company fields are not asked: a customer is not asked to fill in a company record.
 */
export function chooseFieldsToAsk(liveFields: readonly FieldDefinition[]): FieldDefinition[] {
  const askedContactFields = liveFields.filter((field) => field.aiAsks && field.object === 'contact');
  const askedLeadFields = liveFields.filter((field) => field.aiAsks && field.object === 'lead');
  return [...askedContactFields, ...askedLeadFields].slice(0, MOST_FIELDS_ASKED_PER_CONVERSATION);
}
