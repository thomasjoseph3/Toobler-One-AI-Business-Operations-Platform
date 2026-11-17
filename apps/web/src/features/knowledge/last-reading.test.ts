import { afterEach, describe, expect, it, vi } from 'vitest';
import { recallReading, rememberReading } from './last-reading';

/** A tiny pretend localStorage. */
function pretendStorage(initial: Record<string, string> = {}) {
  const held = { ...initial };
  return {
    held,
    getItem: (key: string) => (key in held ? held[key]! : null),
    setItem: (key: string, value: string) => void (held[key] = value),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('the remembered reading', () => {
  it('gives back the reading for the same business, and never another business’s', () => {
    vi.stubGlobal('window', { localStorage: pretendStorage() });
    rememberReading('business-a', 'run-1');
    expect(recallReading('business-a')).toBe('run-1');
    expect(recallReading('business-b')).toBeNull();
  });

  it('keeps only the latest reading', () => {
    vi.stubGlobal('window', { localStorage: pretendStorage() });
    rememberReading('business-a', 'run-1');
    rememberReading('business-a', 'run-2');
    expect(recallReading('business-a')).toBe('run-2');
  });

  it('copes with storage that is empty, broken or refuses to write', () => {
    vi.stubGlobal('window', { localStorage: pretendStorage({ 'toobler.lastReading': 'not json' }) });
    expect(recallReading('business-a')).toBeNull();
    vi.stubGlobal('window', { localStorage: pretendStorage({ 'toobler.lastReading': '{"businessId":"business-a"}' }) });
    expect(recallReading('business-a')).toBeNull();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => rememberReading('business-a', 'run-1')).not.toThrow();
    expect(recallReading('business-a')).toBeNull();
  });
});
