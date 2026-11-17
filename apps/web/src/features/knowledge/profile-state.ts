import type { KnowledgeQuestion, PrefillRun, QuestionSection } from '@toobler-one/shared';

// What the business profile page needs to decide about the questions and about a reading of the website. Pure: no screen, no network.

/** The sections in the order the owner meets them. Section E (the situations) has its own part of the page. */
export const SECTION_ORDER: readonly QuestionSection[] = ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'extra'];

export interface QuestionGroup {
  section: QuestionSection;
  questions: KnowledgeQuestion[];
}

/** The questions in their sections, in order. A section with no question is left out. */
export function groupQuestionsBySection(questions: readonly KnowledgeQuestion[]): QuestionGroup[] {
  return SECTION_ORDER.map((section) => ({
    section,
    questions: questions.filter((question) => question.section === section),
  })).filter((group) => group.questions.length > 0);
}

/**
 * Where a question stands:
 * - `waiting`: the system filled in an answer and the owner has not said Yes yet (the AI does not use it);
 * - `answered`: the owner's answer;
 * - `elsewhere_done` / `elsewhere_open`: answered in another feature (like What you sell), done or not;
 * - `unanswered`: no answer yet.
 */
export type QuestionState = 'waiting' | 'answered' | 'elsewhere_done' | 'elsewhere_open' | 'unanswered';

export function describeQuestionState(question: KnowledgeQuestion): QuestionState {
  if (question.handledElsewhere !== null)
    return question.elsewhereStatus === 'done' ? 'elsewhere_done' : 'elsewhere_open';
  if (question.answer === null) return 'unanswered';
  return question.answer.status === 'check' ? 'waiting' : 'answered';
}

/** The keys of every answer waiting for the owner's Yes, in the order of the list. */
export function findWaitingQuestionKeys(questions: readonly KnowledgeQuestion[]): string[] {
  return questions.filter((question) => describeQuestionState(question) === 'waiting').map((question) => question.key);
}

/** Where a waiting answer came from, as a key for the words "From your website" / "From your Google listing". */
export function describeAnswerSource(question: KnowledgeQuestion): 'website' | 'listing' | 'document' | 'typed' | null {
  return question.answer?.source ?? null;
}

/** How a reading of the website is going, for the page to show. */
export type ReadingState =
  | { kind: 'working' }
  | {
      kind: 'done';
      answersFound: number;
      answersSkipped: number;
      pagesRead: number;
      suggestionCount: number;
      warning: string | null;
    }
  | { kind: 'failed'; message: string };

/** Turns a reading (from the API) into what the page says. A finished reading that found nothing and had a problem is a failure. */
export function describeReading(run: PrefillRun): ReadingState {
  if (run.status === 'queued' || run.status === 'reading') return { kind: 'working' };
  if (run.status === 'failed') return { kind: 'failed', message: run.errorMessage ?? 'We could not read that.' };
  return {
    kind: 'done',
    answersFound: run.answersFound.length,
    answersSkipped: run.answersSkipped,
    pagesRead: run.pagesRead,
    suggestionCount: run.suggestedOfferings.length,
    warning: run.errorMessage,
  };
}

/** How long to wait before asking again how a reading is going: quickly at first, then a little slower, and never for ever. */
export function nextReadingCheckDelayMilliseconds(checksAlreadyMade: number): number | null {
  const MOST_CHECKS = 90; // about 3 minutes
  if (checksAlreadyMade >= MOST_CHECKS) return null;
  return checksAlreadyMade < 10 ? 1000 : 2000;
}
