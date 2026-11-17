// The rules of the setup chat screen: what goes in a reply, and whether it can be sent. Pure functions (no screen, no network),
// so each rule can be tested alone.
import type { SetupChatQuestion } from '@toobler-one/shared';

/** One line of the conversation on screen: the chat asking, the owner replying, or a note about a reply that could not be used. */
export type SetupChatLine =
  { kind: 'question'; text: string } | { kind: 'reply'; text: string } | { kind: 'problem'; text: string };

/** Which kinds of question are answered by picking ready options (shown as buttons). */
export function isPickQuestion(question: SetupChatQuestion): boolean {
  return question.type === 'pick_one' || question.type === 'pick_several';
}

/** True when the owner may type words for this question: every question takes typed words (the chat reads them), so only an empty box cannot be sent. */
export function canSendReply(typedText: string, selectedOptions: readonly string[]): boolean {
  return typedText.trim() !== '' || selectedOptions.length > 0;
}

/**
 * The words sent to the chat for what the owner chose and typed: the chosen options in the order the question lists them (joined with
 * commas, which the chat reads as several options), then anything typed. A single typed answer is sent as typed.
 */
export function buildReplyText(
  question: SetupChatQuestion,
  selectedOptions: readonly string[],
  typedText: string,
): string {
  const orderedChoices = question.options.filter((option) => selectedOptions.includes(option));
  const typed = typedText.trim();
  if (orderedChoices.length === 0) return typed;
  return typed === '' ? orderedChoices.join(', ') : `${orderedChoices.join(', ')}, ${typed}`;
}

/** Adds or removes one option from the chosen ones: a "pick one" keeps only the newest, a "pick several" keeps up to the most allowed. */
export function toggleOption(
  question: SetupChatQuestion,
  selectedOptions: readonly string[],
  option: string,
): string[] {
  if (question.type === 'pick_one') return selectedOptions.includes(option) ? [] : [option];
  if (selectedOptions.includes(option)) return selectedOptions.filter((chosen) => chosen !== option);
  if (question.maxChoices !== null && selectedOptions.length >= question.maxChoices) return [...selectedOptions];
  return [...selectedOptions, option];
}

/** The lines after the chat asked a question: the question is added, unless it is the one already last on screen (a reply that could not be used asks again without repeating itself). */
export function addQuestionLine(lines: readonly SetupChatLine[], question: SetupChatQuestion): SetupChatLine[] {
  const lastQuestion = [...lines].reverse().find((line) => line.kind === 'question');
  if (lastQuestion && lastQuestion.text === question.text && lines.at(-1)?.kind !== 'reply') return [...lines];
  return [...lines, { kind: 'question', text: question.text }];
}
