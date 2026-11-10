import { describe, expect, it } from 'vitest';
import { envFileSetsVariable, readWantedNodeMajor } from './setup.mjs';

describe('setup', () => {
  it('sees whether a .env file already sets a variable', () => {
    expect(envFileSetsVariable('A=1\nJWT_SECRET=abc\n', 'JWT_SECRET')).toBe(true);
    expect(envFileSetsVariable('A=1\nJWT_SECRET=\n', 'JWT_SECRET')).toBe(false); // empty counts as not set
    expect(envFileSetsVariable('# JWT_SECRET=abc\n', 'JWT_SECRET')).toBe(false);
    expect(envFileSetsVariable('NOT_JWT_SECRET=abc', 'JWT_SECRET')).toBe(false);
  });

  it('reads the wanted Node major version from .nvmrc text', () => {
    expect(readWantedNodeMajor('26.13.0\n')).toBe(26);
    expect(readWantedNodeMajor('v24.1.0')).toBe(24);
  });
});
