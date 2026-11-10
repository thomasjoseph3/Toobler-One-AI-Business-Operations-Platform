import { describe, expect, it } from 'vitest';
import { readWantedNodeMajor } from './setup.mjs';

describe('setup', () => {
  it('reads the wanted Node major version from .nvmrc text', () => {
    expect(readWantedNodeMajor('26.13.0\n')).toBe(26);
    expect(readWantedNodeMajor('v24.1.0')).toBe(24);
  });
});
