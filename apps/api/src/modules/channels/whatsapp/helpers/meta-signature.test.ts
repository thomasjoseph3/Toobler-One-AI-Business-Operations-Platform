import { describe, expect, it } from 'vitest';
import { isMetaSignatureValid, isVerifyTokenCorrect, signLikeMeta } from './meta-signature';

const body = Buffer.from('{"entry":[]}');

describe('isMetaSignatureValid', () => {
  it('accepts the signature made with the same secret', () => {
    expect(isMetaSignatureValid(body, signLikeMeta(body, 'app-secret'), 'app-secret')).toBe(true);
  });
  it('refuses a signature made with another secret', () => {
    expect(isMetaSignatureValid(body, signLikeMeta(body, 'other'), 'app-secret')).toBe(false);
  });
  it('refuses a body that was changed after signing', () => {
    const signature = signLikeMeta(body, 'app-secret');
    expect(isMetaSignatureValid(Buffer.from('{"entry":[1]}'), signature, 'app-secret')).toBe(false);
  });
  it('refuses a missing or malformed header, and an empty secret', () => {
    expect(isMetaSignatureValid(body, undefined, 'app-secret')).toBe(false);
    expect(isMetaSignatureValid(body, 'sha256=abc', 'app-secret')).toBe(false);
    expect(isMetaSignatureValid(body, signLikeMeta(body, ''), '')).toBe(false);
  });
});

describe('isVerifyTokenCorrect', () => {
  it('accepts only the exact token', () => {
    expect(isVerifyTokenCorrect('abc123', 'abc123')).toBe(true);
    expect(isVerifyTokenCorrect('abc124', 'abc123')).toBe(false);
    expect(isVerifyTokenCorrect(undefined, 'abc123')).toBe(false);
    expect(isVerifyTokenCorrect('', '')).toBe(false);
  });
});
