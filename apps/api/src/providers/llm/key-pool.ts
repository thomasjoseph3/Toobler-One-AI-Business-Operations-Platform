import { createHash } from 'node:crypto';

// Rotates several keys of one AI company. Free and paid quotas are per key and per model, so when a key hits its limit it is
// set aside for a while and the next key is used. Ported from the hotel agent (shared/keys.js).

const SHORT_REST_MS = 60_000; // a burst limit: try again in a minute
const DAILY_QUOTA_REST_MS = 30 * 60_000; // the day's quota: check again in half an hour
const BAD_KEY_REST_MS = 60 * 60_000; // a rejected key: try again in an hour (the owner may have fixed it)

/** One key and where it sits in its list (1, 2, 3...). */
export interface PooledKey {
  key: string;
  position: number;
}

export interface KeyPool {
  /** Number of keys in the pool. */
  size: number;
  /** The keys in the order to try for this model: the next one in turn first, any that are resting last. */
  keysToTry(scope: string): PooledKey[];
  /** Sets a key aside after a rate limit (longer when it is the day's quota). `scope` is the model name. */
  markLimited(position: number, scope: string, isDailyQuota: boolean): void;
  /** Sets a rejected key aside for an hour, for every model. */
  markBad(position: number): void;
  /** Until when each resting key sits out, for status screens (positions only, never the keys). */
  restingUntil(): { position: number; scope: string; until: Date }[];
}

/** Makes a pool for a list of keys. `now` can be replaced in tests. */
export function createKeyPool(keys: string[], now: () => number = Date.now): KeyPool {
  const restingUntilTime = new Map<string, number>(); // `${scope}|${position}` -> time it can be used again
  const BAD_KEY_SCOPE = '*';
  const nextStartIndexByScope = new Map<string, number>(); // each model rotates on its own

  const isReady = (position: number, scope: string) =>
    (restingUntilTime.get(`${scope}|${position}`) ?? 0) <= now() &&
    (restingUntilTime.get(`${BAD_KEY_SCOPE}|${position}`) ?? 0) <= now();

  return {
    size: keys.length,
    keysToTry(scope) {
      if (keys.length === 0) return [];
      // Start from the next key in turn, so calls spread over all keys even before any limit is hit
      const turn = nextStartIndexByScope.get(scope) ?? 0;
      nextStartIndexByScope.set(scope, turn + 1);
      const startIndex = turn % keys.length;
      const inTurn = keys.map((_, offset) => {
        const index = (startIndex + offset) % keys.length;
        return { key: keys[index] as string, position: index + 1 };
      });
      // Resting keys are still tried, but last (a limit may have lifted, and there may be nothing else)
      return [
        ...inTurn.filter((pooledKey) => isReady(pooledKey.position, scope)),
        ...inTurn.filter((pooledKey) => !isReady(pooledKey.position, scope)),
      ];
    },
    markLimited(position, scope, isDailyQuota) {
      restingUntilTime.set(`${scope}|${position}`, now() + (isDailyQuota ? DAILY_QUOTA_REST_MS : SHORT_REST_MS));
    },
    markBad(position) {
      restingUntilTime.set(`${BAD_KEY_SCOPE}|${position}`, now() + BAD_KEY_REST_MS);
    },
    restingUntil() {
      return [...restingUntilTime.entries()]
        .filter(([, until]) => until > now())
        .map(([name, until]) => {
          const [scope, position] = name.split('|');
          return { position: Number(position), scope: scope as string, until: new Date(until) };
        });
    },
  };
}

const sharedPools = new Map<string, KeyPool>();

/** A name for a list of keys that changes when the list changes, and never contains a key (a fingerprint of the list). */
function nameOfKeyList(keys: string[]): string {
  return createHash('sha256').update(keys.join('\n')).digest('hex');
}

/**
 * The pool for one list of keys. The same name always gets the same pool (by default the name is a fingerprint of the list, so a
 * changed list gets a new pool; a business's own keys are named by business and key ids), so a key set aside after a limit stays aside
 * across calls. Kept in memory per running copy of the API; the database holds the lasting status.
 */
export function poolFor(keys: string[], poolName: string = nameOfKeyList(keys)): KeyPool {
  let pool = sharedPools.get(poolName);
  if (!pool) {
    pool = createKeyPool(keys);
    sharedPools.set(poolName, pool);
  }
  return pool;
}
