import { useState } from 'react';
import type { LoadState } from '../../api/useApiResource';

/**
 * What a screen shows while it loads again after a save: the answer it already had. `useApiResource` goes back to "loading" on every
 * reload, which would blank the whole page (and lose a half-typed answer or a reading in progress). This keeps the last good answer.
 * `isFirstLoad` is true only until the first answer; `hasFailed` only when there is no earlier answer to show.
 */
export function useKeptData<Data>(state: LoadState<Data>): {
  data: Data | null;
  isFirstLoad: boolean;
  hasFailed: boolean;
} {
  const [lastData, setLastData] = useState<Data | null>(null);
  // Remember each good answer as it arrives (React's own pattern for state that follows a prop: set it while rendering, not in an effect)
  if (state.status === 'ready' && state.data !== lastData) setLastData(state.data);
  const data = state.status === 'ready' ? state.data : lastData;
  return {
    data,
    isFirstLoad: data === null && state.status === 'loading',
    hasFailed: data === null && state.status === 'error',
  };
}
