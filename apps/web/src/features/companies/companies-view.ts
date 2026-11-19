// What the Companies list shows (the search text and the page) and how that is kept in the web address.
// Pure functions (no screen, no network), so each rule can be tested alone.

import { parseFiltersText, type FilterCondition } from '@toobler-one/shared';

/** How many companies the list shows on a page (the API's default). */
export const COMPANIES_PAGE_SIZE = 25;

/** What the list is showing: the typed search and the page. */
export interface CompaniesView {
  searchText: string;
  /** Extra conditions on the business's own company fields, every one of which must hold. */
  conditions: FilterCondition[];
  page: number;
}

export const DEFAULT_COMPANIES_VIEW: CompaniesView = { searchText: '', conditions: [], page: 1 };

/** Reads the list's view from the web address. Anything missing or not understood falls back to the default. */
export function readCompaniesView(searchParams: URLSearchParams): CompaniesView {
  const pageNumber = Number(searchParams.get('page'));
  const filtersText = searchParams.get('filters');
  const parsedFilters = filtersText === null ? undefined : parseFiltersText(filtersText);
  return {
    searchText: (searchParams.get('q') ?? '').slice(0, 100),
    conditions: parsedFilters && 'conditions' in parsedFilters ? parsedFilters.conditions : [],
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  };
}

/** Writes the view into web address parameters, leaving out everything that is the default. */
export function writeCompaniesView(view: CompaniesView): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (view.searchText.trim() !== '') searchParams.set('q', view.searchText.trim());
  if (view.conditions.length > 0) searchParams.set('filters', JSON.stringify(view.conditions));
  if (view.page > 1) searchParams.set('page', String(view.page));
  return searchParams;
}

/** The API address for a view: `/companies?q=…&page=…&limit=25`. */
export function buildCompaniesPath(view: CompaniesView): string {
  const query = new URLSearchParams();
  if (view.searchText.trim() !== '') query.set('q', view.searchText.trim());
  if (view.conditions.length > 0) query.set('filters', JSON.stringify(view.conditions));
  query.set('page', String(view.page));
  query.set('limit', String(COMPANIES_PAGE_SIZE));
  return `/companies?${query.toString()}`;
}
