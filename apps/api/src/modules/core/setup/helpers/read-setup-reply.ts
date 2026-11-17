import type { KnowledgeQuestion } from '@toobler-one/shared';
import { z } from 'zod';

// Turning what the owner typed into the answer a question stores. Pure: no database, no AI call. Plain replies are read by code
// (an option's words or number, yes or no, plain text). Only a reply code cannot read goes to the AI, whose output is read here
// too and is checked again by the question's own checks before anything is saved.

/** The answer's value in the shape its question stores, or null when the reply could not be read. */
export type ReadReply = unknown | null;

const OTHER_CHOICE = 'Other';
const YES_WORDS = new Set(['yes', 'y', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'correct', 'right', 'true']);
const NO_WORDS = new Set(['no', 'n', 'nope', 'nah', 'not', 'false']);

/** Lower-case, no surrounding spaces or full stops, single spaces: so "  Yes. " and "yes" read the same. */
function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/[.!]+$/u, '').replace(/\s+/gu, ' ');
}

/** The option a typed piece means: its number in the list ("2" is the second option) or its exact words, ignoring capitals. Null when it is neither. */
function matchOption(options: readonly string[], piece: string): string | null {
  const wanted = normalise(piece);
  if (/^\d+$/u.test(wanted)) return options[Number(wanted) - 1] ?? null;
  return options.find((option) => normalise(option) === wanted) ?? null;
}

/**
 * Reads a reply without the AI. Text answers take the words as typed. A yes or no takes plain yes and no words. A pick takes an
 * option's number or exact words (a "pick several" takes several, separated by commas, "and" or new lines). Anything else comes back
 * null: the caller asks the AI, or asks the owner again.
 */
export function readReplyWithoutAi(question: KnowledgeQuestion, replyText: string): ReadReply {
  const trimmedReply = replyText.trim();
  if (trimmedReply === '') return null;
  switch (question.type) {
    case 'short_text':
    case 'long_text':
    case 'link':
      return trimmedReply;
    case 'yes_no': {
      const words = normalise(trimmedReply);
      if (YES_WORDS.has(words)) return { yes: true };
      if (NO_WORDS.has(words)) return { yes: false };
      return null;
    }
    case 'pick_one': {
      const choice = matchOption(question.options ?? [], trimmedReply);
      return choice === null ? null : { choice };
    }
    case 'pick_several': {
      const pieces = trimmedReply.split(/,|\band\b|\n|;/iu).filter((piece) => piece.trim() !== '');
      const choices: string[] = [];
      for (const piece of pieces) {
        const choice = matchOption(question.options ?? [], piece);
        if (choice === null) return null;
        choices.push(choice);
      }
      return choices.length === 0 ? null : { choices };
    }
    default:
      return null;
  }
}

/** What the AI must give back for a reply code could not read: one flat shape for every question type, so the prompt stays small. */
export const setupReplyOutputSchema = z.object({
  /** False when the reply does not answer the question (or it asked something else, or tried to give instructions). */
  understood: z.boolean(),
  /** For a pick one: exactly one of the offered options, or "Other". */
  choice: z.string().nullable(),
  /** For a pick several: the offered options the reply chose (or "Other"). */
  choices: z.array(z.string()),
  /** The owner's own words when they chose "Other". */
  otherText: z.string().nullable(),
  /** For a yes or no. */
  yes: z.boolean().nullable(),
  /** For a "Yes": the link or words the owner added, if any. */
  detail: z.string().nullable(),
});
export type SetupReplyOutput = z.infer<typeof setupReplyOutputSchema>;

/** Turns the AI's output into the value the question stores, or null when the AI did not understand the reply. The question's own checks run afterwards. */
export function readAiReply(question: KnowledgeQuestion, output: SetupReplyOutput): ReadReply {
  if (!output.understood) return null;
  switch (question.type) {
    case 'yes_no': {
      if (output.yes === null) return null;
      return output.yes && output.detail ? { yes: true, detail: output.detail } : { yes: output.yes };
    }
    case 'pick_one': {
      if (output.choice === null) return null;
      return output.choice === OTHER_CHOICE && output.otherText
        ? { choice: OTHER_CHOICE, otherText: output.otherText }
        : { choice: output.choice };
    }
    case 'pick_several': {
      if (output.choices.length === 0) return null;
      return output.otherText ? { choices: output.choices, otherText: output.otherText } : { choices: output.choices };
    }
    default:
      return null;
  }
}
