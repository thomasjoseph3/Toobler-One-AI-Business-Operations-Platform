import type { Config } from '../../../kernel/config';
import type { Database } from '../../../kernel/db';
import { ApiError, unauthorized } from '../../../kernel/errors';
import type { Authenticator } from '../../../kernel/http/guard';
import { readAccessCookie } from './cookies';
import * as repository from './repository';
import { AccessTokenError, verifyAccessToken } from './tokens';

/**
 * Builds the function that tells who is signed in. It reads the access cookie, checks the token, and then checks in the
 * database that the session is still live and the person still active, so signing out, a password change or disabling a
 * person stops access at once. An expired token answers TOKEN_EXPIRED, which tells the web app to refresh and retry.
 */
export function createSessionAuthenticator({
  config,
  database,
}: {
  config: Config;
  database: Database;
}): Authenticator {
  return async (request) => {
    const accessToken = readAccessCookie(request, config);
    if (!accessToken) throw unauthorized();
    let claims;
    try {
      claims = await verifyAccessToken(accessToken, config.auth.jwtSecret);
    } catch (error) {
      if (error instanceof AccessTokenError && error.reason === 'expired') {
        throw new ApiError(401, 'TOKEN_EXPIRED', 'Your sign-in needs refreshing.');
      }
      throw unauthorized();
    }
    const principal = await repository.findLivePrincipal(database.system, claims.sessionId, claims.userId);
    if (!principal) throw new ApiError(401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.');
    return principal;
  };
}
