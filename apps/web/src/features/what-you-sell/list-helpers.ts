import type { SuggestedOffering } from '@toobler-one/shared';

// Small list rules for the What you sell page. Pure: no screen, no network.

/** The ids with one moved a place up or down. An id at the end of the list that cannot move further, or an unknown id, gives the list as it was. */
export function moveId(ids: readonly string[], id: string, direction: 'up' | 'down'): string[] {
  const position = ids.indexOf(id);
  const target = direction === 'up' ? position - 1 : position + 1;
  if (position === -1 || target < 0 || target >= ids.length) return [...ids];
  const moved = [...ids];
  [moved[position], moved[target]] = [moved[target]!, moved[position]!];
  return moved;
}

/** The things the website seems to sell that are not already offerings (the same name, capitals ignored) and that the owner has not dismissed. */
export function pickSuggestionsToShow(
  suggestions: readonly SuggestedOffering[],
  existingNames: readonly string[],
  dismissedNames: ReadonlySet<string>,
): SuggestedOffering[] {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  return suggestions.filter((suggestion) => {
    const key = suggestion.name.trim().toLowerCase();
    return !taken.has(key) && !dismissedNames.has(key);
  });
}

/** The key a dismissed suggestion is remembered by. */
export const suggestionKey = (suggestion: SuggestedOffering): string => suggestion.name.trim().toLowerCase();
