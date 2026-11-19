import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { signVisitorToken, verifyVisitorToken, VISITOR_TOKEN_HOURS } from './visitor-token';

const secret = 'a-test-secret-a-test-secret-a-test-secret';
const accountId = '0197c0de-0000-7000-8000-000000000001';
const conversationId = '0197c0de-0000-7000-8000-000000000002';

describe('visitor token', () => {
  it('is read back as the business and the conversation it was made for', async () => {
    const token = await signVisitorToken({ appSecret: secret, accountId, conversationId });
    expect(await verifyVisitorToken({ appSecret: secret, token })).toEqual({ accountId, conversationId });
  });

  it('is refused when it has run out', async () => {
    const madeAt = new Date('2026-11-16T10:00:00Z');
    const token = await signVisitorToken({ appSecret: secret, accountId, conversationId, now: madeAt });
    const justBefore = new Date(madeAt.getTime() + (VISITOR_TOKEN_HOURS * 3600 - 60) * 1000);
    const justAfter = new Date(madeAt.getTime() + (VISITOR_TOKEN_HOURS * 3600 + 60) * 1000);
    expect(await verifyVisitorToken({ appSecret: secret, token, now: justBefore })).toBeDefined();
    expect(await verifyVisitorToken({ appSecret: secret, token, now: justAfter })).toBeUndefined();
  });

  it('is refused when it was signed with another secret, or changed', async () => {
    const token = await signVisitorToken({ appSecret: secret, accountId, conversationId });
    expect(await verifyVisitorToken({ appSecret: 'another-secret-another-secret-another', token })).toBeUndefined();
    const [header, payload, signature] = token.split('.');
    const changedPayload = Buffer.from(JSON.stringify({ accountId: 'someone-else', sub: conversationId })).toString(
      'base64url',
    );
    expect(
      await verifyVisitorToken({ appSecret: secret, token: `${header}.${changedPayload}.${signature}` }),
    ).toBeUndefined();
    expect(payload).toBeDefined();
  });

  it('is refused when it is a sign-in style token made with the app secret itself', async () => {
    const lookalike = await new SignJWT({ accountId: accountId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('toobler-one')
      .setAudience('webchat-visitor')
      .setSubject(conversationId)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));
    expect(await verifyVisitorToken({ appSecret: secret, token: lookalike })).toBeUndefined();
  });

  it('is refused when it is not a token at all', async () => {
    expect(await verifyVisitorToken({ appSecret: secret, token: 'not a token' })).toBeUndefined();
    expect(await verifyVisitorToken({ appSecret: secret, token: '' })).toBeUndefined();
  });
});
