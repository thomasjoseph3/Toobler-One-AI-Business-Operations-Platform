import { createHmac } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

// The visitor token: what proves that a browser owns a chat. It is signed by the server, names the business and the conversation, and
// runs out. Nobody can make one, change one, or use one on another business's chat.

const TOKEN_ISSUER = 'toobler-one';
const TOKEN_AUDIENCE = 'webchat-visitor';
/** How long a token works. A chat ends after 15 minutes of silence anyway; this is only the longest a browser may keep one. */
export const VISITOR_TOKEN_HOURS = 24;

/** What a good token says: which business, and which conversation. */
export interface VisitorTokenClaims {
  accountId: string;
  conversationId: string;
}

/**
 * The key that signs visitor tokens, made from the app's secret and a fixed phrase, so it can never be the same key that signs the staff's
 * sign-in tokens (a visitor token is refused as a sign-in token, and the other way round).
 */
function makeSigningKey(appSecret: string): Uint8Array {
  return new Uint8Array(createHmac('sha256', appSecret).update('toobler-one webchat visitor token').digest());
}

/** Makes a token for this business's conversation. */
export async function signVisitorToken(options: {
  appSecret: string;
  accountId: string;
  conversationId: string;
  now?: Date;
}): Promise<string> {
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ accountId: options.accountId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setSubject(options.conversationId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + VISITOR_TOKEN_HOURS * 3600)
    .sign(makeSigningKey(options.appSecret));
}

/** Reads a token. Answers what it says, or undefined when it is not ours, was changed, has run out, or is not a token at all. */
export async function verifyVisitorToken(options: {
  appSecret: string;
  token: string;
  now?: Date;
}): Promise<VisitorTokenClaims | undefined> {
  try {
    const { payload } = await jwtVerify(options.token, makeSigningKey(options.appSecret), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: ['HS256'],
      ...(options.now ? { currentDate: options.now } : {}),
    });
    const accountId = payload['accountId'];
    if (typeof accountId !== 'string' || typeof payload.sub !== 'string') return undefined;
    return { accountId, conversationId: payload.sub };
  } catch {
    return undefined;
  }
}
