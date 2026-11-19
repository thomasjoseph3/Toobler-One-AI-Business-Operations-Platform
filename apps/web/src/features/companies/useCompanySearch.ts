import { useEffect, useState } from 'react';
import type { CompaniesListResponse } from '@toobler-one/shared';
import { apiRequest } from '../../api/client';

/** How long to wait after the last key press before searching, so typing does not search on every letter. */
const SEARCH_DELAY_MILLISECONDS = 300;
/** The fewest letters worth searching for. */
export const MINIMUM_COMPANY_SEARCH_LENGTH = 2;
/** How many companies the search shows. */
const SEARCH_RESULT_LIMIT = 5;

/** What the company search has: too little typed to search, searching, failed, or the companies found. */
export type CompanySearchState =
  | { status: 'tooShort' }
  | { status: 'searching' }
  | { status: 'error' }
  | { status: 'found'; companies: CompaniesListResponse['items'] };

/**
 * Searches the business's companies (`GET /companies?q=`) for what is typed, a moment after the typing stops. An answer for an older search is
 * never shown: each answer is stored with the text it was for.
 */
export function useCompanySearch(typedText: string): CompanySearchState {
  const searchText = typedText.trim();
  const [settledText, setSettledText] = useState('');
  const [answer, setAnswer] = useState<
    | { searchText: string; outcome: 'error' }
    | { searchText: string; outcome: 'found'; companies: CompaniesListResponse['items'] }
    | null
  >(null);

  // Wait for the typing to pause before the text counts
  useEffect(() => {
    const timer = setTimeout(() => setSettledText(searchText), SEARCH_DELAY_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Search for the settled text (when it is long enough)
  useEffect(() => {
    if (settledText.length < MINIMUM_COMPANY_SEARCH_LENGTH) return;
    let isCancelled = false;
    apiRequest<CompaniesListResponse>(
      'GET',
      `/companies?q=${encodeURIComponent(settledText)}&limit=${SEARCH_RESULT_LIMIT}`,
    )
      .then((response) => {
        if (!isCancelled) setAnswer({ searchText: settledText, outcome: 'found', companies: response.items });
      })
      .catch(() => {
        if (!isCancelled) setAnswer({ searchText: settledText, outcome: 'error' });
      });
    return () => {
      isCancelled = true;
    };
  }, [settledText]);

  if (searchText.length < MINIMUM_COMPANY_SEARCH_LENGTH) return { status: 'tooShort' };
  if (answer === null || answer.searchText !== searchText) return { status: 'searching' };
  return answer.outcome === 'error' ? { status: 'error' } : { status: 'found', companies: answer.companies };
}
