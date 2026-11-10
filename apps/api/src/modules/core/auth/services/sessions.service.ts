import type { ProfileResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as accountsRepository from '../repositories/accounts.repository';
import * as credentialsRepository from '../repositories/credentials.repository';
import * as sessionsRepository from '../repositories/sessions.repository';
import * as usersRepository from '../repositories/users.repository';
import { NO_SUCH_USER_HASH, passwordMatches } from '../helpers/passwords';
import { generateSecret, hashSecret, signAccessToken } from '../helpers/tokens';

/** The browser or app signing in, kept with the session ("who signed in from where"). */
export interface ClientInfo {
  userAgent: string | null;
  ip: string | null;
}

/** What a successful sign-in gives the route: the two tokens for the cookies, and the profile for the answer. */
export interface SignInResult {
  tokens: { accessToken: string; refreshToken: string };
  profile: ProfileResponse;
}

/**
 * Everything about signing in and out. The route calls this.
 * Repositories used: accounts, users, credentials, sessions (all in ../repositories).
 */
export function createSessionsService({ config, database }: { config: Config; database: Database }) {
  return {
    /**
     * Ends the session the person is using, so its tokens stop working at once (the authenticator checks the session on
     * every request). The person's other sessions, on other devices, are not touched. Writes an activity-log line.
     */
    async signOut(principal: Principal, client: ClientInfo): Promise<void> {
      await database.runInSystemTransaction(async (transaction) => {
        await sessionsRepository.revokeSession(transaction, principal.sessionId, 'signed out');
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: 'auth.signed_out',
          details: {
            recordType: 'user',
            recordId: principal.userId,
            ...(client.ip ? { ip: client.ip } : {}),
            ...(client.userAgent ? { userAgent: client.userAgent } : {}),
          },
        });
      });
    },

    /**
     * Checks the email and password and opens a session. A wrong password, an unknown email and a disabled person all get
     * the same answer, and take about the same time (an unknown email is checked against a stand-in hash).
     */
    async signIn(email: string, password: string, client: ClientInfo): Promise<SignInResult> {
      const person = await usersRepository.findPersonByEmail(database.system, email);
      const storedHash = person ? await credentialsRepository.findPasswordHash(database.system, person.id) : undefined;
      const passwordIsRight = await passwordMatches(storedHash ?? (await NO_SUCH_USER_HASH), password);
      if (!person || !storedHash || person.status !== 'active' || !passwordIsRight) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is not right.');
      }

      // A new session for every sign-in. Only the hash of the refresh token is stored.
      const refreshToken = generateSecret();
      const sessionId = uuidv7();
      await database.runInSystemTransaction(async (transaction) => {
        await sessionsRepository.insertSession(transaction, {
          id: sessionId,
          userId: person.id,
          refreshTokenHash: hashSecret(refreshToken),
          userAgent: client.userAgent,
          ip: client.ip,
          maxDays: config.auth.sessionMaxDays,
        });
        await usersRepository.markLoggedIn(transaction, person.id);
        await writeActivityLog(transaction, {
          accountId: person.accountId,
          actor: { kind: 'user', id: person.id },
          kind: 'auth.signed_in',
          details: {
            recordType: 'user',
            recordId: person.id,
            ...(client.ip ? { ip: client.ip } : {}),
            ...(client.userAgent ? { userAgent: client.userAgent } : {}),
          },
        });
      });

      const business = await accountsRepository.findAccountById(database.system, person.accountId);
      if (!business) throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is not right.');
      const accessToken = await signAccessToken(
        { userId: person.id, sessionId },
        { secret: config.auth.jwtSecret, minutes: config.auth.accessTokenMinutes },
      );
      return {
        tokens: { accessToken, refreshToken },
        profile: {
          user: {
            id: person.id,
            name: person.name,
            email: person.email,
            mobile: person.mobile,
            role: person.role,
            emailVerified: person.emailVerified,
          },
          business,
        },
      };
    },
  };
}

export type SessionsService = ReturnType<typeof createSessionsService>;
