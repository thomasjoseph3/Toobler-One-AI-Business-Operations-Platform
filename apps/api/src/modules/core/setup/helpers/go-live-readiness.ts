// Whether a business may start answering real customers, worked out by code from facts (never by the AI). Pure: no database.

/** One thing still stopping the business going live. `question` names a business question; `step` names a setup step. */
export interface GoLiveBlocker {
  kind: 'question' | 'step';
  key: string;
}

export interface GoLiveFacts {
  /** The "needed to go live" questions that still have no confirmed answer. */
  neededQuestionsStillMissing: readonly string[];
  /** The owner has finished the "How fast will you call back" step. */
  promisesStepDone: boolean;
  /** The owner has had at least one reply from the agent in "Test the agent". */
  hasTriedTheAgent: boolean;
}

/** What still stops the business going live, questions first. Empty when it may go live. */
export function findGoLiveBlockers(facts: GoLiveFacts): GoLiveBlocker[] {
  const blockers: GoLiveBlocker[] = facts.neededQuestionsStillMissing.map((key) => ({ kind: 'question', key }));
  if (!facts.promisesStepDone) blockers.push({ kind: 'step', key: 'promises' });
  if (!facts.hasTriedTheAgent) blockers.push({ kind: 'step', key: 'test_agent' });
  return blockers;
}
