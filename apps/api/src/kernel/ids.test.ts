import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from './ids';

describe('uuidv7', () => {
  it('is a valid version 7 UUID', () => {
    const newId = uuidv7();
    expect(isUuid(newId)).toBe(true);
    expect(newId[14]).toBe('7');
    expect('89ab').toContain(newId[19]);
  });
  it('sorts by time', () => {
    const earlierId = uuidv7(1_700_000_000_000);
    const laterId = uuidv7(1_700_000_001_000);
    expect(earlierId < laterId).toBe(true);
  });
  it('rejects things that are not ids', () => {
    for (const notAnId of ['', 'abc', null, undefined, 42, "1' or '1'='1"]) expect(isUuid(notAnId)).toBe(false);
  });
});
