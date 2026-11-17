import type { Faq, FaqSource, UnansweredQuestion } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

// What the FAQs page needs to decide about unanswered questions and FAQs. Pure: no screen, no network.

/** "Asked once" or "Asked 4 times". */
export function describeAskedTimes(count: number): { key: MessageKey; count: number } {
  return count === 1 ? { key: 'faqs.asked.once', count } : { key: 'faqs.asked.many', count };
}

/** The words for where an FAQ came from. */
export const FAQ_SOURCE_WORDS: Readonly<Record<FaqSource, MessageKey>> = {
  typed: 'faqs.source.typed',
  website: 'faqs.source.website',
  unanswered: 'faqs.source.unanswered',
};

/** True for an FAQ the system drafted that the owner has not accepted yet: the AI does not use it. */
export const isWaitingForCheck = (faq: Faq): boolean => faq.status === 'check';

/** The open questions most asked first (the API already does this; kept here so the page never depends on it silently). Ties keep the API's order. */
export function sortOpenQuestions(questions: readonly UnansweredQuestion[]): UnansweredQuestion[] {
  return questions
    .map((question, position) => ({ question, position }))
    .sort((first, second) => second.question.count - first.question.count || first.position - second.position)
    .map((entry) => entry.question);
}

/** A date like "17 Nov 2026" from an ISO moment, in the business's time zone. */
export function formatAskedDate(isoText: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(isoText));
}
