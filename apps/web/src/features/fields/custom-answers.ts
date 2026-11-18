// The pure logic for answering custom fields in a form: what a box holds, how it is turned into the request, and how an answer is shown.
// No screen code here, so it is tested on its own.
import type { CustomValue, CustomValuesInput, FieldDefinition } from '@toobler-one/shared';
import { t } from '../../app/i18n';

/** What the boxes of a form hold: for each field key, the typed text (a dropdown holds the chosen choice, Yes/No holds `yes`, `no` or empty). */
export type CustomAnswerTexts = Record<string, string>;

/** The text a box holds for a saved answer (empty when nothing is saved). */
function answerToText(definition: FieldDefinition, answer: CustomValue | undefined): string {
  if (answer === undefined) return '';
  if (definition.type === 'yes_no') return answer === true ? 'yes' : answer === false ? 'no' : '';
  return String(answer);
}

/** Fills a form's boxes with what a record has saved now (a field with no answer is an empty box). */
export function answersToTexts(
  definitions: readonly FieldDefinition[],
  saved: Readonly<Record<string, CustomValue>>,
): CustomAnswerTexts {
  const texts: CustomAnswerTexts = {};
  for (const definition of definitions) texts[definition.key] = answerToText(definition, saved[definition.key]);
  return texts;
}

/**
 * The `custom` part of a request: only the boxes that differ from what is saved. A box that was emptied is sent as `null` (remove the answer), a
 * filled one as its text (the API checks and tidies it). A box that is still empty and never had an answer is left out. Returns undefined when
 * nothing changed, so the request can leave `custom` out.
 */
export function buildCustomRequest(
  definitions: readonly FieldDefinition[],
  texts: Readonly<CustomAnswerTexts>,
  saved: Readonly<Record<string, CustomValue>> = {},
): CustomValuesInput | undefined {
  const request: CustomValuesInput = {};
  for (const definition of definitions) {
    const typed = (texts[definition.key] ?? '').trim();
    const before = answerToText(definition, saved[definition.key]);
    if (typed === before) continue;
    request[definition.key] = typed === '' ? null : typed;
  }
  return Object.keys(request).length > 0 ? request : undefined;
}

/** How a saved answer reads on a page: Yes/No in words, the rest as saved, and "none" when there is no answer. */
export function describeAnswer(definition: FieldDefinition, answer: CustomValue | undefined): string {
  if (answer === undefined) return t('contacts.none');
  if (definition.type === 'yes_no') return answer === true ? t('fields.answer.yes') : t('fields.answer.no');
  return String(answer);
}
