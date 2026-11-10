import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AccessTokenError, generateSecret, hashSecret, signAccessToken, verifyAccessToken } from './tokens';

const SECRET = 'a-secret-for-tests-that-is-long-enough-123';
const claims = { userId: 'user-1', sessionId: 'session-1' };
const now = new Date('2026-11-10T10:00:00Z');
const minutesLater = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

describe('access tokens', () => {
  it('carry the person and the session, and verify while they are valid', async () => {
    const token = await signAccessToken(claims, { secret: SECRET, minutes: 15 }, now);
    expect(await verifyAccessToken(token, SECRET, minutesLater(14))).toEqual(claims);
  });

  it('are refused after they expire, and say so (so the app can refresh)', async () => {
    const token = await signAccessToken(claims, { secret: SECRET, minutes: 15 }, now);
    await expect(verifyAccessToken(token, SECRET, minutesLater(16))).rejects.toMatchObject({ reason: 'expired' });
  });

  it('are refused when forged: wrong secret, edited payload, not a token, wrong issuer', async () => {
    const token = await signAccessToken(claims, { secret: SECRET, minutes: 15 }, now);
    await expect(
      verifyAccessToken(token, 'another-secret-that-is-also-long-enough-1', minutesLater(1)),
    ).rejects.toMatchObject({ reason: 'invalid' });

    const [header, , signature] = token.split('.');
    const editedPayload = Buffer.from(
      JSON.stringify({
        sub: 'someone-else',
        sid: 'session-1',
        iss: 'toobler-api',
        aud: 'toobler-web',
        exp: 9999999999,
      }),
    ).toString('base64url');
    await expect(
      verifyAccessToken(`${header}.${editedPayload}.${signature}`, SECRET, minutesLater(1)),
    ).rejects.toBeInstanceOf(AccessTokenError);

    await expect(verifyAccessToken('not-a-token', SECRET, now)).rejects.toMatchObject({ reason: 'invalid' });

    // Signed with the right secret but by a different issuer: still refused
    const foreignToken = await new SignJWT({ sid: 'session-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('someone-else')
      .setAudience('toobler-web')
      .setExpirationTime(minutesLater(5))
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyAccessToken(foreignToken, SECRET, now)).rejects.toMatchObject({ reason: 'invalid' });
  });
});

describe('secrets', () => {
  it('are long, random, and hash to a stable text that does not contain them', () => {
    const first = generateSecret();
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(first).not.toBe(generateSecret());
    expect(hashSecret(first)).toBe(hashSecret(first));
    expect(hashSecret(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(first)).not.toContain(first);
  });
});
