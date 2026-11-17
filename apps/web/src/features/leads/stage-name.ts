// The rule for naming a pipeline column, kept apart from the screen so it can be tested on its own.
import type { MessageKey } from '../../app/i18n';

/** The longest stage name the API accepts. */
export const MAX_STAGE_NAME_LENGTH = 60;

/** Checks a typed column name: the words to show if it is not allowed (empty, too long), or null when it is fine. */
export function checkStageName(typedName: string): MessageKey | null {
  const name = typedName.trim();
  if (name === '') return 'pipeline.name.needed';
  if (name.length > MAX_STAGE_NAME_LENGTH) return 'pipeline.name.tooLong';
  return null;
}
