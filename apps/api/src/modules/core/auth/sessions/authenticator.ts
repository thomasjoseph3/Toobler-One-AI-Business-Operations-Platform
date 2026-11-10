import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError, unauthorized } from '../../../../kernel/errors';
import type { Authenticator } from '../../../../kernel/http/guard';
import * as sessionsRepository from '../data/sessions.repository';
import { readAccessCookie } from './cookies';
import { AccessTokenError, verifyAccessToken } from './tokens';

/**
 * Builds the function that tells who is signed in. The kernel calls it before every route that needs a signed-in person.
 * It reads the access cookie, checks the token, and then checks in the database that the session is still alive and the
 * person still active, so signing out or disabling someone stops access at once. An expired token answers TOKEN_EXPIRED,
 * which tells the web app to refresh it (the refresh route arrives in a later slice).
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

    const principal = await sessionsRepository.findLivePrincipal(database.system, claims.sessionId, claims.userId);
    if (!principal) throw new ApiError(401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.');
    return principal;
  };
}
