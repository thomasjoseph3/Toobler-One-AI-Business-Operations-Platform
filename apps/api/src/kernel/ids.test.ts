import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from './ids';

describe('uuidv7', () => {
  it('is a valid version 7 UUID', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });
  it('sorts by time', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_001_000);
    expect(a < b).toBe(true);
  });
  it('rejects things that are not ids', () => {
    for (const bad of ['', 'abc', null, undefined, 42, "1' or '1'='1"]) expect(isUuid(bad)).toBe(false);
  });
});
