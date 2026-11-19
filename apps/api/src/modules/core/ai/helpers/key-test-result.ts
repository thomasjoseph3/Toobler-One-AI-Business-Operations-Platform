import type { AiKeyStatus, AiKeyTestOutcome } from '@toobler-one/shared';
import type { LlmAttempt } from '../../../../providers/llm';

// Turns what happened in a key test into the key's new status, a plain-English note and the outcome. Pure: no database, no network.

export interface KeyTestFinding {
  outcome: AiKeyTestOutcome;
  /** The key's new status, or null to leave its status as it was (the test could not tell). */
  status: AiKeyStatus | null;
  /** A plain-English note for the screen (at most 300 characters). Never holds the key or the company's own error text. */
  note: string;
}

/** The finding when a model answered. */
export function findingWhenKeyWorks(modelName: string, latencyMs: number): KeyTestFinding {
  return { outcome: 'works', status: 'working', note: `Answered using ${modelName} in ${latencyMs} ms.` };
}

/**
 * The finding when no model answered. What the company said decides, in this order: a rejected key beats everything (the key is
 * wrong), then a used-up quota, then "no model is available to this key". Anything else (a timeout, a network problem) tells us
 * nothing about the key, so its status is left alone.
 */
export function findingWhenKeyFails(attempts: LlmAttempt[]): KeyTestFinding {
  if (attempts.some((attempt) => attempt.outcome === 'bad_key')) {
    return {
      outcome: 'rejected',
      status: 'failed',
      note: 'The AI company rejected this key. Check that it is copied correctly and that it is switched on.',
    };
  }
  if (attempts.some((attempt) => attempt.outcome === 'rate_limited')) {
    return {
      outcome: 'quota',
      status: 'limited',
      note: 'The AI company says the quota is used up or it is busy right now. Try again later.',
    };
  }
  if (attempts.length > 0 && attempts.every((attempt) => attempt.outcome === 'model_missing')) {
    return {
      outcome: 'no_model',
      status: 'failed',
      note: 'None of the models we tried are available to this key.',
    };
  }
  return {
    outcome: 'unreachable',
    status: null,
    note: 'We could not get an answer from the AI company just now. Try again in a moment.',
  };
}
