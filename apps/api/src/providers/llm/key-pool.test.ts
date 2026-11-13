import { describe, expect, it } from 'vitest';
import { createKeyPool, poolFor } from './key-pool';

describe('key pool', () => {
  it('has nothing to try when it has no keys', () => {
    expect(createKeyPool([]).keysToTry('model-a')).toEqual([]);
  });

  it('spreads calls over the keys in turn', () => {
    const pool = createKeyPool(['k1', 'k2', 'k3']);
    const firstChoices = [1, 2, 3, 4].map(() => pool.keysToTry('m')[0]?.position);
    expect(firstChoices).toEqual([1, 2, 3, 1]);
  });

  it('rotates each model on its own, so a busy model does not disturb another', () => {
    const pool = createKeyPool(['k1', 'k2']);
    expect(pool.keysToTry('model-a')[0]?.position).toBe(1);
    expect(pool.keysToTry('model-b')[0]?.position).toBe(1);
    expect(pool.keysToTry('model-a')[0]?.position).toBe(2);
  });

  it('puts a rate-limited key last for that model only, then brings it back', () => {
    let time = 1_000_000;
    const pool = createKeyPool(['k1', 'k2'], () => time);
    pool.markLimited(1, 'model-a', false);
    // key 1 is resting for model-a, so key 2 comes first (whatever the turn)
    expect(pool.keysToTry('model-a')[0]?.position).toBe(2);
    expect(pool.keysToTry('model-a')[0]?.position).toBe(2);
    expect(pool.keysToTry('model-a').map((pooled) => pooled.position)).toEqual([2, 1]);
    // another model is not affected
    const otherModelOrder = new Set([pool.keysToTry('model-b')[0]?.position, pool.keysToTry('model-b')[0]?.position]);
    expect(otherModelOrder).toEqual(new Set([1, 2]));
    time += 61_000; // a minute later it is back
    const afterRest = new Set([pool.keysToTry('model-a')[0]?.position, pool.keysToTry('model-a')[0]?.position]);
    expect(afterRest).toEqual(new Set([1, 2]));
  });

  it('rests a key longer for the daily quota than for a burst', () => {
    let time = 0;
    const pool = createKeyPool(['k1', 'k2'], () => time);
    pool.markLimited(1, 'm', true);
    time += 10 * 60_000;
    expect(pool.keysToTry('m')[0]?.position).toBe(2);
    time += 21 * 60_000;
    expect(pool.restingUntil()).toEqual([]);
  });

  it('puts a rejected key last for every model, for an hour', () => {
    let time = 0;
    const pool = createKeyPool(['k1', 'k2'], () => time);
    pool.markBad(2);
    expect(pool.keysToTry('any-model')[0]?.position).toBe(1);
    expect(pool.keysToTry('another-model')[0]?.position).toBe(1);
    time += 61 * 60_000;
    expect(pool.restingUntil()).toEqual([]);
  });

  it('still lists resting keys (last), because a limit may have lifted and there may be nothing else', () => {
    const pool = createKeyPool(['only']);
    pool.markBad(1);
    expect(pool.keysToTry('m').map((pooled) => pooled.position)).toEqual([1]);
  });

  it('gives the same pool for the same list of keys, so the resting state is kept between calls', () => {
    const first = poolFor(['shared-a', 'shared-b']);
    expect(poolFor(['shared-a', 'shared-b'])).toBe(first);
    expect(poolFor(['shared-b', 'shared-a'])).not.toBe(first);
  });

  it('reports positions only, never the keys', () => {
    const pool = createKeyPool(['secret-one', 'secret-two']);
    pool.markBad(1);
    expect(JSON.stringify(pool.restingUntil())).not.toContain('secret');
  });
});
