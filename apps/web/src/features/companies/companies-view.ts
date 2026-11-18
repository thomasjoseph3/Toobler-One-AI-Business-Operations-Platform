// What the Companies list shows (the search text and the page) and how that is kept in the web address.
// Pure functions (no screen, no network), so each rule can be tested alone.

/** How many companies the list shows on a page (the API's default). */
export const COMPANIES_PAGE_SIZE = 25;

/** What the list is showing: the typed search and the page. */
export interface CompaniesView {
  searchText: string;
  page: number;
}

export const DEFAULT_COMPANIES_VIEW: CompaniesView = { searchText: '', page: 1 };

/** Reads the list's view from the web address. Anything missing or not understood falls back to the default. */
export function readCompaniesView(searchParams: URLSearchParams): CompaniesView {
  const pageNumber = Number(searchParams.get('page'));
  return {
    searchText: (searchParams.get('q') ?? '').slice(0, 100),
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  };
}

/** Writes the view into web address parameters, leaving out everything that is the default. */
export function writeCompaniesView(view: CompaniesView): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (view.searchText.trim() !== '') searchParams.set('q', view.searchText.trim());
  if (view.page > 1) searchParams.set('page', String(view.page));
  return searchParams;
}

/** The API address for a view: `/companies?q=…&page=…&limit=25`. */
export function buildCompaniesPath(view: CompaniesView): string {
  const query = new URLSearchParams();
  if (view.searchText.trim() !== '') query.set('q', view.searchText.trim());
  query.set('page', String(view.page));
  query.set('limit', String(COMPANIES_PAGE_SIZE));
  return `/companies?${query.toString()}`;
}
