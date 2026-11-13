import { describe, expect, it } from 'vitest';
import { ownKeyPoolName } from './pool-names';

describe('ownKeyPoolName', () => {
  it('is made of ids, and changes when the business or the list of keys changes', () => {
    const name = ownKeyPoolName('acc-1', 'gemini', ['k1', 'k2']);
    expect(name).toBe('own:acc-1:gemini:k1,k2');
    expect(ownKeyPoolName('acc-2', 'gemini', ['k1', 'k2'])).not.toBe(name);
    expect(ownKeyPoolName('acc-1', 'openai', ['k1', 'k2'])).not.toBe(name);
    expect(ownKeyPoolName('acc-1', 'gemini', ['k1'])).not.toBe(name);
  });
});
