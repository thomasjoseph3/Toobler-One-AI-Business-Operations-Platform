import { useEffect, useState } from 'react';
import { ApiRequestError, apiRequest } from './client';

/** What a screen has for one piece of data: still loading, could not load, or the answer. */
/** `httpStatus` on an error is the API's status (404 = no such thing), or 0 when the server could not be reached at all. */
export type LoadState<Data> =
  { status: 'loading' } | { status: 'error'; httpStatus: number } | { status: 'ready'; data: Data };

/**
 * Loads one address from the API (`GET path`) and says whether it is loading, failed, or ready. It loads again when the
 * address changes, and `reload` tries again after an error. Each answer is stored with the request it belongs to, so while a
 * new address is on its way the state is "loading", and an answer that arrives late for an old address is never shown.
 */
export function useApiResource<Data>(path: string): { state: LoadState<Data>; reload: () => void } {
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${path}#${reloadCount}`;
  const [answer, setAnswer] = useState<
    | { requestKey: string; outcome: 'error'; httpStatus: number }
    | { requestKey: string; outcome: 'ready'; data: Data }
    | null
  >(null);

  useEffect(() => {
    let isCancelled = false;
    apiRequest<Data>('GET', path)
      .then((data) => {
        if (!isCancelled) setAnswer({ requestKey, outcome: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setAnswer({ requestKey, outcome: 'error', httpStatus: error instanceof ApiRequestError ? error.status : 0 });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [path, requestKey]);

  const state: LoadState<Data> =
    answer === null || answer.requestKey !== requestKey
      ? { status: 'loading' }
      : answer.outcome === 'error'
        ? { status: 'error', httpStatus: answer.httpStatus }
        : { status: 'ready', data: answer.data };
  return { state, reload: () => setReloadCount((count) => count + 1) };
}
