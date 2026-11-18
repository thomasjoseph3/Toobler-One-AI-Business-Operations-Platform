import { useEffect, useRef } from 'react';

/** How long to wait after an update before asking again, so a burst of messages makes one refresh. */
const QUIET_MILLISECONDS = 300;

/**
 * Listens to the live updates stream (`GET /events`, server-sent events) while the screen is open and calls `onUpdate` when something changed in the
 * business, so the screen refetches what it shows. It also calls `onUpdate` when the connection comes back after a break, to catch up on what was
 * missed. The browser reconnects by itself. Does nothing in a browser without EventSource.
 */
export function useLiveUpdates(onUpdate: () => void): void {
  const latestOnUpdate = useRef(onUpdate);
  useEffect(() => {
    latestOnUpdate.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/v1/events');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hasBeenOpenBefore = false;
    const askSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latestOnUpdate.current(), QUIET_MILLISECONDS);
    };
    source.addEventListener('update', askSoon);
    source.addEventListener('open', () => {
      if (hasBeenOpenBefore) askSoon(); // the connection came back: catch up
      hasBeenOpenBefore = true;
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, []);
}
