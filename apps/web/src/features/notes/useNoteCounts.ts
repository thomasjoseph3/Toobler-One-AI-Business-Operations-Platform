import { useEffect, useState } from 'react';
import type { NoteCountsResponse } from '@toobler-one/shared';
import { apiRequest } from '../../api/client';
import { buildNoteCountsPath } from './notes-state';

/**
 * How many notes each lead on the page has (`GET /activities/counts`), for the orange notes icon in the list. It asks once for the leads
 * on screen, and again when `reload` is called (after a note was added or deleted). A failed or slow answer is not an error on screen: the
 * icon simply is not shown until the counts arrive. An answer for leads that are no longer on screen is never shown.
 */
export function useNoteCounts(leadIds: readonly string[]): {
  counts: Readonly<Record<string, number>>;
  reload: () => void;
} {
  const path = buildNoteCountsPath(leadIds);
  const [reloadCount, setReloadCount] = useState(0);
  const [answer, setAnswer] = useState<{ requestKey: string; counts: Record<string, number> } | null>(null);
  const requestKey = `${path}#${reloadCount}`;

  useEffect(() => {
    if (path === null) return;
    let isCancelled = false;
    apiRequest<NoteCountsResponse>('GET', path)
      .then((response) => {
        if (!isCancelled) setAnswer({ requestKey: `${path}#${reloadCount}`, counts: response.counts });
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [path, reloadCount]);

  // Counts from an older request (other leads, or before a note was added) are kept until the newer answer arrives, so the icons do not blink
  const counts = answer !== null && path !== null ? answer.counts : {};
  void requestKey;
  return { counts, reload: () => setReloadCount((count) => count + 1) };
}
