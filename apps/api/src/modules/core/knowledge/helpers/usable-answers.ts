import type { AnswerStatus } from '@toobler-one/shared';

/**
 * Keeps only the answers the AI may use: the confirmed ones. An answer still waiting for a check (filled in by the system,
 * not yet accepted by a manager) is never given to the AI. The AI agent (F19) builds what it knows about the business from
 * this and nothing else. Pure: no database.
 */
export function onlyConfirmedAnswers<Answer extends { status: AnswerStatus }>(answers: readonly Answer[]): Answer[] {
  return answers.filter((answer) => answer.status === 'confirmed');
}
