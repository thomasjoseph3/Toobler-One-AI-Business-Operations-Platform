import type { AnswerType, KnowledgeQuestion } from '@toobler-one/shared';

// Which business questions the setup chat can ask, and which one comes next. Pure: no database, no AI.

/** The answer types a chat can take: plain words, a link, a pick or a yes/no. Opening hours, lists, prices and files are easier in the form. */
const CHAT_ANSWER_TYPES: ReadonlySet<AnswerType> = new Set(['short_text', 'long_text', 'link', 'pick_one', 'pick_several', 'yes_no']);

/** True when the chat can ask this question: it is answered in the profile (not in offerings, FAQs or documents) and its type suits a chat. */
export function isChatQuestion(question: KnowledgeQuestion): boolean {
  return question.handledElsewhere === null && CHAT_ANSWER_TYPES.has(question.type);
}

/** True when the question still needs an answer: it has none (an answer waiting for a check counts as given: the owner confirms it in the form). */
function isUnanswered(question: KnowledgeQuestion): boolean {
  return question.answer === null;
}

/** The next question the chat asks: the first one, in the profile's own order, that it can ask, that is unanswered and that was not skipped. Null when none is left. */
export function chooseNextChatQuestion(
  questions: readonly KnowledgeQuestion[],
  skippedQuestionKeys: ReadonlySet<string>,
): KnowledgeQuestion | null {
  return (
    questions.find(
      (question) => isChatQuestion(question) && isUnanswered(question) && !skippedQuestionKeys.has(question.key),
    ) ?? null
  );
}

/** How many unanswered questions the chat cannot ask because they are easier in the form (and are answered in the profile). */
export function countFormOnlyQuestions(questions: readonly KnowledgeQuestion[]): number {
  return questions.filter(
    (question) => question.handledElsewhere === null && !isChatQuestion(question) && isUnanswered(question),
  ).length;
}
