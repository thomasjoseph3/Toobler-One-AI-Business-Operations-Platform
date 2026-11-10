import { createHash, randomBytes } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';

// Access tokens are signed JWTs (HS256): they name the person and the session and last a few minutes. Nothing else is
// in them: the business and the role are read from the database on every request.
const ISSUER = 'toobler-api';
const AUDIENCE = 'toobler-web';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

/** Why an access token was refused: it ran out (the app should refresh it) or it is not a valid token of ours. */
export class AccessTokenError extends Error {
  constructor(readonly reason: 'expired' | 'invalid') {
    super(`Access token ${reason}`);
  }
}

const keyFromSecret = (secret: string) => new TextEncoder().encode(secret);

/** Signs an access token that lasts `minutes` from `now`. */
export async function signAccessToken(
  claims: AccessTokenClaims,
  settings: { secret: string; minutes: number },
  now: Date = new Date(),
): Promise<string> {
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(new Date(now.getTime() + settings.minutes * 60_000))
    .sign(keyFromSecret(settings.secret));
}

/** Checks an access token's signature, issuer, audience and expiry (at `now`). Throws AccessTokenError when refused. */
export async function verifyAccessToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, keyFromSecret(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new AccessTokenError('invalid');
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (error) {
    if (error instanceof AccessTokenError) throw error;
    throw new AccessTokenError(error instanceof errors.JWTExpired ? 'expired' : 'invalid');
  }
}

/** A new random secret (256 bits) for a refresh token or an email link. Shown once, stored only as a hash. */
export const generateSecret = (): string => randomBytes(32).toString('base64url');

/** The SHA-256 hash we store instead of a refresh token or an email link. (Fine for long random secrets; not for passwords.) */
export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');
