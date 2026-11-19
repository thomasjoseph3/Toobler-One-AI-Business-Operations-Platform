// A small counter for "no more than N of these in a time window", kept in the server's memory. Here it stops one customer (or a flood) from running up
// AI calls. In memory is enough: a restart simply forgets the counts.

/** A limiter. `tryTake` answers true when one more is allowed (and counts it), false when the limit is reached. */
export interface WindowLimiter {
  tryTake(name: string, now?: Date): boolean;
}

/** At most `max` takes per name within each `windowMilliseconds`. Names that stop appearing are forgotten, so memory stays small. */
export function createWindowLimiter(options: { max: number; windowMilliseconds: number }): WindowLimiter {
  const counts = new Map<string, { windowStartedAt: number; taken: number }>();
  return {
    tryTake(name, now = new Date()) {
      const moment = now.getTime();
      // Drop names whose window is over (cheap: only when the map has grown)
      if (counts.size > 10_000) {
        for (const [storedName, storedCount] of counts) {
          if (moment - storedCount.windowStartedAt >= options.windowMilliseconds) counts.delete(storedName);
        }
      }
      const entry = counts.get(name);
      if (!entry || moment - entry.windowStartedAt >= options.windowMilliseconds) {
        counts.set(name, { windowStartedAt: moment, taken: 1 });
        return true;
      }
      if (entry.taken >= options.max) return false;
      entry.taken += 1;
      return true;
    },
  };
}
