import { useEffect, useState } from 'react';
import type { NextDueResponse } from '@toobler-one/shared';
import { apiRequest } from '../../api/client';

/** The address that asks when each of these leads' next task is due, or null when there are no leads (nothing to ask). */
export function buildNextDuePath(leadIds: readonly string[]): string | null {
  if (leadIds.length === 0) return null;
  return `/tasks/next-due?lead_ids=${leadIds.join(',')}`;
}

/**
 * When each lead on the page has its next task due (`GET /tasks/next-due`), for the date in the Leads list's "Next activity" column. It asks once for the
 * leads on screen, and again when `reload` is called (after a task was added). A failed or slow answer is not an error on screen: the date is simply not
 * shown until it arrives. Dates from an older request are kept until the newer answer arrives, so the dates do not blink.
 */
export function useNextTaskDates(leadIds: readonly string[]): {
  dates: Readonly<Record<string, string | null>>;
  reload: () => void;
} {
  const path = buildNextDuePath(leadIds);
  const [reloadCount, setReloadCount] = useState(0);
  const [answer, setAnswer] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    if (path === null) return;
    let isCancelled = false;
    apiRequest<NextDueResponse>('GET', path)
      .then((response) => {
        if (!isCancelled) setAnswer(response.dates);
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [path, reloadCount]);

  return { dates: path !== null && answer !== null ? answer : {}, reload: () => setReloadCount((count) => count + 1) };
}
