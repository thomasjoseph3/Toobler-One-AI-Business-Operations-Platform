import { useEffect, useState } from 'react';
import type { GlobalSearchResponse } from '@toobler-one/shared';
import { apiRequest } from '../../api/client';

/** How long to wait after the last key press before searching, so typing does not search on every letter. */
const SEARCH_DELAY_MILLISECONDS = 300;
/** The fewest letters worth searching for (the API refuses less). */
export const MINIMUM_GLOBAL_SEARCH_LENGTH = 2;

/** What the top-bar search has: too little typed, searching, failed, or what was found. */
export type GlobalSearchState =
  | { status: 'tooShort' }
  | { status: 'searching' }
  | { status: 'error' }
  | { status: 'found'; results: GlobalSearchResponse };

/**
 * Searches contacts, companies and leads (`GET /search?q=`) for what is typed, a moment after the typing stops. An answer for an older search is never
 * shown: each answer is stored with the text it was for.
 */
export function useGlobalSearch(typedText: string): GlobalSearchState {
  const searchText = typedText.trim();
  const [settledText, setSettledText] = useState('');
  const [answer, setAnswer] = useState<
    | { searchText: string; outcome: 'error' }
    | { searchText: string; outcome: 'found'; results: GlobalSearchResponse }
    | null
  >(null);

  // Wait for the typing to pause before the text counts
  useEffect(() => {
    const timer = setTimeout(() => setSettledText(searchText), SEARCH_DELAY_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Search for the settled text (when it is long enough)
  useEffect(() => {
    if (settledText.length < MINIMUM_GLOBAL_SEARCH_LENGTH) return;
    let isCancelled = false;
    apiRequest<GlobalSearchResponse>('GET', `/search?q=${encodeURIComponent(settledText)}`)
      .then((results) => {
        if (!isCancelled) setAnswer({ searchText: settledText, outcome: 'found', results });
      })
      .catch(() => {
        if (!isCancelled) setAnswer({ searchText: settledText, outcome: 'error' });
      });
    return () => {
      isCancelled = true;
    };
  }, [settledText]);

  if (searchText.length < MINIMUM_GLOBAL_SEARCH_LENGTH) return { status: 'tooShort' };
  if (answer === null || answer.searchText !== searchText) return { status: 'searching' };
  return answer.outcome === 'error' ? { status: 'error' } : { status: 'found', results: answer.results };
}
