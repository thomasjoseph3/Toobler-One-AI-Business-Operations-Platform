import {
  checkFilterConditions,
  parseFiltersText,
  type CheckedFilterCondition,
  type FilterableField,
} from '@toobler-one/shared';
import { ApiError } from '../errors';

/**
 * Reads the `filters` of a list request (the filter engine, F11): the text must be a JSON list of conditions, and every condition must make sense for the
 * fields this list can be filtered on. Throws 400 INVALID_FILTERS with the first problem in words. No filters means no conditions. Every list uses this, so
 * the lists can never disagree about what a filter is.
 */
export function readFilterRequest(
  filtersText: string | undefined,
  filterable: readonly FilterableField[],
): CheckedFilterCondition[] {
  if (filtersText === undefined || filtersText.trim() === '') return [];
  const parsed = parseFiltersText(filtersText);
  if ('problem' in parsed) throw new ApiError(400, 'INVALID_FILTERS', parsed.problem);
  if (parsed.conditions.length === 0) return [];
  const { checked, problems } = checkFilterConditions(parsed.conditions, filterable);
  const firstProblem = problems[0];
  if (firstProblem) throw new ApiError(400, 'INVALID_FILTERS', firstProblem.message, { problems });
  return checked;
}
