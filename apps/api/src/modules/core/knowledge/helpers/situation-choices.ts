import type { Situation } from '@toobler-one/shared';
import { defaultChoiceKey, SITUATIONS } from './situations';
import type { SituationDefinition } from './situations';

/** A choice the business has saved for one situation. */
export interface SavedSituationChoice {
  situationKey: string;
  choice: string;
  updatedAt: Date;
}

/**
 * Puts one situation together with the business's saved choice. A business that has not chosen gets the ready-picked default
 * (the first choice). A saved choice that is no longer one of the situation's choices (a choice removed in a later version)
 * also falls back to the default, so the AI never reads a way of handling that does not exist. Pure: no database.
 */
export function resolveSituation(definition: SituationDefinition, saved: SavedSituationChoice | undefined): Situation {
  const savedChoiceStillExists =
    saved !== undefined && definition.choices.some((choice) => choice.key === saved.choice);
  return {
    key: definition.key,
    text: definition.text,
    fixed: definition.fixed,
    choices: definition.choices.map((choice) => ({ key: choice.key, label: choice.label })),
    selectedChoiceKey: savedChoiceStillExists ? saved.choice : defaultChoiceKey(definition),
    isDefault: !savedChoiceStillExists,
    updatedAt: savedChoiceStillExists ? saved.updatedAt.toISOString() : null,
  };
}

/** All seven situations with the business's choices, in the fixed order of the list. */
export function resolveAllSituations(savedChoices: readonly SavedSituationChoice[]): Situation[] {
  const savedByKey = new Map(savedChoices.map((saved) => [saved.situationKey, saved]));
  return SITUATIONS.map((definition) => resolveSituation(definition, savedByKey.get(definition.key)));
}
