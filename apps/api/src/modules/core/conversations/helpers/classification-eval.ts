import { UNSURE_CONFIDENCE, type TypeClassification } from './router';
import type { TranscriptLine } from './classifier-prompt';

// The yardstick for the classifier (docs/CONVERSATION-TYPES.md, "How we test it"): labelled example conversations, and the maths that turns
// "what the AI said for each example" into the three numbers the design sets targets for. Pure: no AI, no database, no files.

/** Primary type right at least this often. */
export const PRIMARY_ACCURACY_TARGET = 0.9;
/** A complaint must never be lost as something else: at least this share of complaints must still raise a complaint. */
export const COMPLAINT_RECALL_TARGET = 0.95;
/** Conversations that are not sales must not become leads: at most this share may. */
export const FALSE_LEAD_RATE_LIMIT = 0.05;

/** One labelled example: what a person wrote, and what it really was about. */
export interface EvalExample {
  id: string;
  /** Plain text, or lines starting "Customer:" and "Business:" for a conversation with more than one turn. */
  text: string;
  primary: string;
  /** Other real reasons in the same conversation. */
  secondary?: string[];
  needsPerson?: boolean;
}

/**
 * Reads a file of examples, one JSON object per line (blank lines are ignored). Says which line is wrong when one is: a labelling
 * mistake must not quietly weaken the measurement.
 */
export function parseEvalExamples(fileText: string): EvalExample[] {
  const examples: EvalExample[] = [];
  const idsSeen = new Set<string>();
  for (const [index, line] of fileText.split('\n').entries()) {
    if (line.trim() === '') continue;
    const where = `line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`The example on ${where} is not valid JSON.`);
    }
    const example = value as Partial<EvalExample>;
    if (typeof example.id !== 'string' || example.id === '') throw new Error(`The example on ${where} has no id.`);
    if (idsSeen.has(example.id)) throw new Error(`The id ${example.id} (${where}) is used twice.`);
    if (typeof example.text !== 'string' || example.text.trim() === '') throw new Error(`${example.id} has no text.`);
    if (typeof example.primary !== 'string' || example.primary === '')
      throw new Error(`${example.id} has no primary type.`);
    if (
      example.secondary !== undefined &&
      !(Array.isArray(example.secondary) && example.secondary.every((item) => typeof item === 'string'))
    ) {
      throw new Error(`${example.id} has a secondary list that is not a list of type keys.`);
    }
    idsSeen.add(example.id);
    examples.push(example as EvalExample);
  }
  return examples;
}

/** Turns an example's text into the lines of a conversation: "Business:" lines are the business, anything else is the customer. */
export function parseEvalTranscript(text: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const rawLine of text.split('\n')) {
    const business = /^Business:\s*(.*)$/.exec(rawLine);
    const customer = /^Customer:\s*(.*)$/.exec(rawLine);
    if (business) lines.push({ speaker: 'business', text: business[1] ?? '' });
    else if (customer) lines.push({ speaker: 'customer', text: customer[1] ?? '' });
    else if (lines.length > 0) lines[lines.length - 1]!.text += `\n${rawLine}`;
    else lines.push({ speaker: 'customer', text: rawLine });
  }
  return lines;
}

/** One example with what the AI said about it. */
export interface EvalResult {
  example: EvalExample;
  predicted: TypeClassification;
}

/** The measurement. */
export interface EvalReport {
  total: number;
  primaryAccuracy: number;
  /** Null when there are no complaints among the examples. */
  complaintRecall: number | null;
  /** Null when there are no examples that are not sales. */
  falseLeadRate: number | null;
  passes: { primaryAccuracy: boolean; complaintRecall: boolean; falseLeadRate: boolean };
  /** The examples the AI got wrong (the main type), for reading and fixing. */
  misses: Array<{ id: string; expected: string; got: string }>;
}

/**
 * The types the router would act on for a classification: the main one (or "unclear" when it is below 0.40) and every secondary one at 0.40
 * or more. This is what decides whether a conversation ends up as a lead or a ticket, so it is what the measurement looks at.
 */
export function typesThatWouldBeApplied(predicted: TypeClassification): { primary: string; all: string[] } {
  const primary = predicted.primary.confidence >= UNSURE_CONFIDENCE ? predicted.primary.typeKey : 'unclear';
  const secondary = predicted.secondary
    .slice(0, 2)
    .filter((other) => other.confidence >= UNSURE_CONFIDENCE)
    .map((other) => other.typeKey);
  return { primary, all: [...new Set([primary, ...secondary])] };
}

/**
 * Scores a run. `leadTypeKeys` are the types of the business that make a lead (so "false lead" means: nothing in the example is sales, but
 * the AI's answer would still create a lead). The three numbers and whether each meets its target, plus the examples missed.
 */
export function scoreEvalResults(results: readonly EvalResult[], leadTypeKeys: ReadonlySet<string>): EvalReport {
  const misses: EvalReport['misses'] = [];
  let primaryRight = 0;
  let complaintCount = 0;
  let complaintsRaised = 0;
  let notSalesCount = 0;
  let falseLeads = 0;

  for (const { example, predicted } of results) {
    const applied = typesThatWouldBeApplied(predicted);
    if (applied.primary === example.primary) primaryRight += 1;
    else misses.push({ id: example.id, expected: example.primary, got: applied.primary });

    if (example.primary === 'complaint') {
      complaintCount += 1;
      if (applied.all.includes('complaint')) complaintsRaised += 1;
    }

    const expectedTypes = [example.primary, ...(example.secondary ?? [])];
    if (!expectedTypes.some((typeKey) => leadTypeKeys.has(typeKey))) {
      notSalesCount += 1;
      if (applied.all.some((typeKey) => leadTypeKeys.has(typeKey))) falseLeads += 1;
    }
  }

  const total = results.length;
  const primaryAccuracy = total === 0 ? 0 : primaryRight / total;
  const complaintRecall = complaintCount === 0 ? null : complaintsRaised / complaintCount;
  const falseLeadRate = notSalesCount === 0 ? null : falseLeads / notSalesCount;
  return {
    total,
    primaryAccuracy,
    complaintRecall,
    falseLeadRate,
    passes: {
      primaryAccuracy: primaryAccuracy >= PRIMARY_ACCURACY_TARGET,
      complaintRecall: complaintRecall === null || complaintRecall >= COMPLAINT_RECALL_TARGET,
      falseLeadRate: falseLeadRate === null || falseLeadRate <= FALSE_LEAD_RATE_LIMIT,
    },
    misses,
  };
}
