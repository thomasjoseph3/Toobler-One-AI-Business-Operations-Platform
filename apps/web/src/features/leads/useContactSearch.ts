import { useEffect, useState } from 'react';
import type { ContactsListResponse } from '@toobler-one/shared';
import { apiRequest } from '../../api/client';

/** How long to wait after the last key press before searching, so typing does not search on every letter. */
const SEARCH_DELAY_MILLISECONDS = 300;
/** The fewest letters worth searching for. */
export const MINIMUM_SEARCH_LENGTH = 2;
/** How many people the search shows. */
const SEARCH_RESULT_LIMIT = 5;

/** What the person search has: too little typed to search, searching, failed, or the people found. */
export type ContactSearchState =
  | { status: 'tooShort' }
  | { status: 'searching' }
  | { status: 'error' }
  | { status: 'found'; people: ContactsListResponse['items'] };

/**
 * Searches the business's contacts (`GET /contacts?q=`) for what is typed, a moment after the typing stops. An answer for an
 * older search is never shown: each answer is stored with the text it was for.
 */
export function useContactSearch(typedText: string): ContactSearchState {
  const searchText = typedText.trim();
  const [settledText, setSettledText] = useState('');
  const [answer, setAnswer] = useState<
    | { searchText: string; outcome: 'error' }
    | { searchText: string; outcome: 'found'; people: ContactsListResponse['items'] }
    | null
  >(null);

  // Wait for the typing to pause before the text counts
  useEffect(() => {
    const timer = setTimeout(() => setSettledText(searchText), SEARCH_DELAY_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Search for the settled text (when it is long enough)
  useEffect(() => {
    if (settledText.length < MINIMUM_SEARCH_LENGTH) return;
    let isCancelled = false;
    apiRequest<ContactsListResponse>(
      'GET',
      `/contacts?q=${encodeURIComponent(settledText)}&limit=${SEARCH_RESULT_LIMIT}`,
    )
      .then((response) => {
        if (!isCancelled) setAnswer({ searchText: settledText, outcome: 'found', people: response.items });
      })
      .catch(() => {
        if (!isCancelled) setAnswer({ searchText: settledText, outcome: 'error' });
      });
    return () => {
      isCancelled = true;
    };
  }, [settledText]);

  if (searchText.length < MINIMUM_SEARCH_LENGTH) return { status: 'tooShort' };
  if (answer === null || answer.searchText !== searchText) return { status: 'searching' };
  return answer.outcome === 'error' ? { status: 'error' } : { status: 'found', people: answer.people };
}
