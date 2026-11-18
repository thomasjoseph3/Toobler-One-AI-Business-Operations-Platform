import { validateCustomValues, type CustomValue, type FieldDefinition } from '@toobler-one/shared';
import { z } from 'zod';
import type { AgentConversationState, StateChange } from './agent-conversation-state';

// What the customer told the agent for the business's own custom fields, and the rules for keeping it. The model only passes on the
// customer's words; the SAME shared check the API uses decides whether an answer is acceptable. Pure: no database.

/** What the model may save: which field (by its name) and what the customer said. */
export const saveCustomAnswersInputSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            field: z.string().trim().min(1).max(80).describe('The name of the field, exactly as listed'),
            answer: z.string().trim().min(1).max(500).describe("The customer's answer, as they gave it"),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
export type SaveCustomAnswersInput = z.infer<typeof saveCustomAnswersInputSchema>;

/** The name a saved answer is kept under: the record it belongs to, a dot, the field's key ("contact.car_model"). */
export function makeCustomAnswerName(field: Pick<FieldDefinition, 'object' | 'key'>): string {
  return `${field.object}.${field.key}`;
}

/**
 * Saves the customer's answers for the fields the AI may ask about. An answer for a field that is not one of them, or that does not fit the
 * field (a date that is not a date, a dropdown choice that does not exist), is not saved, and the model is told what to ask again.
 */
export function recordCustomAnswers(
  state: AgentConversationState,
  input: SaveCustomAnswersInput,
  fieldsToAsk: readonly FieldDefinition[],
): StateChange {
  const customAnswers: Record<string, CustomValue> = { ...state.customAnswers };
  const problems: string[] = [];
  for (const { field: fieldName, answer } of input.answers) {
    const definition = fieldsToAsk.find(
      (candidate) => candidate.label.toLowerCase() === fieldName.trim().toLowerCase(),
    );
    if (!definition) {
      problems.push(`"${fieldName}" is not a field you ask about: do not save it.`);
      continue;
    }
    const check = validateCustomValues([definition], { [definition.key]: answer });
    const problem = check.problems[0];
    if (problem) {
      problems.push(`${problem.message} Ask the customer again, in plain words.`);
      continue;
    }
    const value = check.values[definition.key];
    if (value === null || value === undefined) continue;
    customAnswers[makeCustomAnswerName(definition)] = value;
  }
  return { state: { ...state, customAnswers }, messageForModel: ['Saved.', ...problems].join(' ') };
}

/** The fields still to ask about (those with no answer yet), for the prompt. */
export function findFieldsStillToAsk(
  fieldsToAsk: readonly FieldDefinition[],
  customAnswers: Readonly<Record<string, CustomValue>>,
): FieldDefinition[] {
  return fieldsToAsk.filter((field) => customAnswers[makeCustomAnswerName(field)] === undefined);
}

/**
 * Splits the saved answers ("contact.car_model") into those for the contact and those for the lead, by field key, keeping only fields that are
 * still live (a field removed since the customer answered is dropped). Pure.
 */
export function splitCustomAnswersByRecord(
  customAnswers: Readonly<Record<string, CustomValue>>,
  liveKeys: { contact: readonly string[]; lead: readonly string[] },
): { contact: Record<string, CustomValue>; lead: Record<string, CustomValue> } {
  const split = { contact: {} as Record<string, CustomValue>, lead: {} as Record<string, CustomValue> };
  for (const [name, value] of Object.entries(customAnswers)) {
    const [record, key] = name.split('.');
    if (key === undefined) continue;
    if (record === 'contact' && liveKeys.contact.includes(key)) split.contact[key] = value;
    if (record === 'lead' && liveKeys.lead.includes(key)) split.lead[key] = value;
  }
  return split;
}
