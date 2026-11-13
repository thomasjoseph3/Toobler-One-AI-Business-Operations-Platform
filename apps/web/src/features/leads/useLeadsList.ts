import { useEffect, useState } from 'react';
import type { LeadsListResponse, Pipeline } from '@toobler-one/shared';
import { apiRequest } from '../../api/client';

/** What the screen has: still loading, could not load, or the answer. */
export type LoadState<Data> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: Data };

/** One page of open leads together with the pipeline (the stages in order, which the tag colours depend on). */
export interface LeadsListData {
  leads: LeadsListResponse;
  /** The ids of the open stages in pipeline order. */
  openStageIdsInOrder: string[];
}

/** How many leads one page holds. */
export const LEADS_PAGE_SIZE = 25;

/**
 * Loads one page of open leads (`GET /leads?status=open`) and the pipeline (`GET /pipeline`). It loads again when the page
 * changes, and `reload` tries again after an error. Each answer is stored with the request it belongs to, so while a new
 * page is on its way the state is "loading", and an answer that arrives late for an old page is never shown.
 */
export function useLeadsList(page: number): { state: LoadState<LeadsListData>; reload: () => void } {
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${page}:${reloadCount}`;
  const [answer, setAnswer] = useState<
    { requestKey: string; outcome: 'error' } | { requestKey: string; outcome: 'ready'; data: LeadsListData } | null
  >(null);

  useEffect(() => {
    let isCancelled = false;
    Promise.all([
      apiRequest<LeadsListResponse>('GET', `/leads?status=open&page=${page}&limit=${LEADS_PAGE_SIZE}`),
      apiRequest<Pipeline>('GET', '/pipeline'),
    ])
      .then(([leads, pipeline]) => {
        if (isCancelled) return;
        const openStageIdsInOrder = pipeline.stages.filter((stage) => stage.kind === 'open').map((stage) => stage.id);
        setAnswer({ requestKey, outcome: 'ready', data: { leads, openStageIdsInOrder } });
      })
      .catch(() => {
        if (!isCancelled) setAnswer({ requestKey, outcome: 'error' });
      });
    return () => {
      isCancelled = true;
    };
  }, [page, requestKey]);

  const state: LoadState<LeadsListData> =
    answer === null || answer.requestKey !== requestKey
      ? { status: 'loading' }
      : answer.outcome === 'error'
        ? { status: 'error' }
        : { status: 'ready', data: answer.data };
  return { state, reload: () => setReloadCount((count) => count + 1) };
}
