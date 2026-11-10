import type { FastifyBaseLogger } from 'fastify';
import type { ProfileResponse, SignUpRequest } from '@toobler-one/shared';
import { writeActivityLog, type ActivityDetails } from '../../../kernel/activity-log';
import type { Config } from '../../../kernel/config';
import type { RequestContext } from '../../../kernel/context';
import type { Database, Db } from '../../../kernel/db';
import { ApiError, badRequest, conflict, notFound } from '../../../kernel/errors';
import type { Principal } from '../../../kernel/http/guard';
import { uuidv7 } from '../../../kernel/ids';
import type { MailProvider } from '../../../providers/mail';
import { buildPasswordResetEmail, buildVerificationEmail } from './emails';
import { findPasswordProblem, hashPassword, NO_SUCH_USER_HASH, passwordMatches } from './passwords';
import { normaliseMobile } from './phone';
import * as repository from './repository';
import { generateSecret, hashSecret, signAccessToken } from './tokens';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const REFRESH_GRACE_SECONDS = 60; // two requests refreshing at once are not theft
const EMAIL_LINK_HOURS = 48;
const RESET_LINK_HOURS = 1;

const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is not right.');
const loginLocked = () =>
  new ApiError(429, 'LOGIN_LOCKED', `Too many wrong attempts. Please try again in ${LOCK_MINUTES} minutes.`);
const sessionEnded = () => new ApiError(401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.');
const invalidLink = () => new ApiError(400, 'INVALID_LINK', 'This link is not valid, or it has expired or been used.');

/** The browser or app making the request, kept with the session ("who signed in from where"). */
export interface ClientInfo {
  userAgent: string | null;
  ip: string | null;
}

/** What a sign-in or a refresh gives back for the cookies. A refresh that lost a race has no new refresh token. */
export interface IssuedTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface AuthServiceDependencies {
  config: Config;
  database: Database;
  mail: MailProvider;
  logger: FastifyBaseLogger;
}

/**
 * Everything about signing up, signing in, staying signed in and passwords. Routes call this; this calls the
 * repository. Sign-in runs on the owner connection because no business is known yet; once it is, writes that belong to a
 * business (the activity log) run inside that business's fence.
 */
export function createAuthService({ config, database, mail, logger }: AuthServiceDependencies) {
  const accessTokenSettings = { secret: config.auth.jwtSecret, minutes: config.auth.accessTokenMinutes };

  /** Starts a session and returns the two tokens. Runs inside the caller's transaction so a failure leaves nothing behind. */
  const startSession = async (transaction: Db, userId: string, client: ClientInfo) => {
    const refreshToken = generateSecret();
    const sessionId = uuidv7();
    await repository.insertSession(transaction, {
      id: sessionId,
      userId,
      refreshTokenHash: hashSecret(refreshToken),
      userAgent: client.userAgent,
      ip: client.ip,
      maxDays: config.auth.sessionMaxDays,
    });
    return { sessionId, refreshToken };
  };

  const signAccess = (userId: string, sessionId: string) => signAccessToken({ userId, sessionId }, accessTokenSettings);

  const activityDetails = (userId: string, client: ClientInfo): ActivityDetails => ({
    recordType: 'user',
    recordId: userId,
    ...(client.ip ? { ip: client.ip } : {}),
    ...(client.userAgent ? { userAgent: client.userAgent } : {}),
  });

  /** Writes a sign-in related line to the activity log, inside the person's business fence. */
  const auditInFence = (accountId: string, userId: string, kind: string, client: ClientInfo) =>
    database.runInAccountTransaction(accountId, (transaction) =>
      writeActivityLog(transaction, {
        accountId,
        actor: { kind: 'user', id: userId },
        kind,
        details: activityDetails(userId, client),
      }),
    );

  /** Sends an email without letting a mail problem break the request: the person can ask for the email again. */
  const sendMailSafely = async (message: Parameters<MailProvider['send']>[0]) => {
    try {
      await mail.send(message);
    } catch (error) {
      logger.error({ err: error }, 'could not send an email'); // never the address or the text
    }
  };

  /** Makes a fresh single-use link for a person and returns the secret to put in the email. */
  const createEmailLink = async (
    transaction: Db,
    userId: string,
    kind: 'email_verify' | 'password_reset',
    lifetimeHours: number,
  ) => {
    await repository.retireAuthTokens(transaction, userId, kind); // only the newest link works
    const secret = generateSecret();
    await repository.insertAuthToken(transaction, {
      id: uuidv7(),
      kind,
      userId,
      secretHash: hashSecret(secret),
      lifetimeHours,
    });
    return secret;
  };

  const verificationLink = (secret: string) => `${config.webUrl}/verify-email?token=${encodeURIComponent(secret)}`;
  const resetLink = (secret: string) => `${config.webUrl}/reset-password?token=${encodeURIComponent(secret)}`;

  return {
    /**
     * Creates a business and its owner, signs them in, and emails the verification link. One email can only ever manage
     * one business, so an email that is already registered is refused.
     */
    async signUp(
      request: SignUpRequest,
      client: ClientInfo,
    ): Promise<{ tokens: IssuedTokens; profile: ProfileResponse }> {
      const mobile = normaliseMobile(request.mobile, config.defaultCountryCode);
      if (!mobile) throw new ApiError(400, 'INVALID_MOBILE', 'Enter a valid mobile number, like +91 98470 12345.');
      const passwordProblem = findPasswordProblem(request.password, {
        email: request.email,
        mobileDigits: mobile.e164.replace(/\D/g, ''),
      });
      if (passwordProblem) throw new ApiError(400, 'WEAK_PASSWORD', passwordProblem);

      const passwordHash = await hashPassword(request.password);
      const accountId = uuidv7();
      const userId = uuidv7();
      const emailTakenError = () =>
        conflict('EMAIL_TAKEN', 'An account with this email already exists. Try signing in instead.');

      let created;
      try {
        created = await database.runInSystemTransaction(async (transaction) => {
          if (await repository.emailIsRegistered(transaction, request.email)) throw emailTakenError();
          await repository.insertAccount(transaction, {
            id: accountId,
            name: request.businessName,
            industry: request.industry,
          });
          await repository.insertUser(transaction, {
            id: userId,
            accountId,
            email: request.email,
            name: request.name,
            mobileE164: mobile.e164,
            mobileKey: mobile.key,
            role: 'manager',
            createdBy: { kind: 'user', id: userId },
          });
          await repository.insertCredentials(transaction, userId, passwordHash);
          const session = await startSession(transaction, userId, client);
          const verifySecret = await createEmailLink(transaction, userId, 'email_verify', EMAIL_LINK_HOURS);
          await writeActivityLog(transaction, {
            accountId,
            actor: { kind: 'user', id: userId },
            kind: 'auth.signed_up',
            details: activityDetails(userId, client),
          });
          return { session, verifySecret };
        });
      } catch (error) {
        // Two sign-ups with the same email at the same moment: the database's unique index decides
        if (error instanceof Error && 'code' in error && error.code === '23505') throw emailTakenError();
        throw error;
      }

      await sendMailSafely(
        buildVerificationEmail({
          to: request.email,
          name: request.name,
          businessName: request.businessName,
          link: verificationLink(created.verifySecret),
        }),
      );
      return {
        tokens: {
          accessToken: await signAccess(userId, created.session.sessionId),
          refreshToken: created.session.refreshToken,
        },
        profile: {
          user: {
            id: userId,
            name: request.name,
            email: request.email,
            mobile: mobile.e164,
            role: 'manager',
            emailVerified: false,
          },
          business: { id: accountId, name: request.businessName, industry: request.industry, timeZone: 'Asia/Kolkata' },
        },
      };
    },

    /** Checks the email link and marks the address verified. */
    async verifyEmail(secret: string, client: ClientInfo): Promise<void> {
      const link = await repository.findUsableAuthToken(database.system, 'email_verify', hashSecret(secret));
      if (!link) throw invalidLink();
      await database.runInSystemTransaction(async (transaction) => {
        if (!(await repository.useAuthToken(transaction, link.id))) throw invalidLink(); // used a moment ago by another request
        await repository.markEmailVerified(transaction, link.userId);
        const person = await repository.findPersonById(transaction, link.userId);
        if (person) {
          await writeActivityLog(transaction, {
            accountId: person.accountId,
            actor: { kind: 'user', id: person.id },
            kind: 'auth.email_verified',
            details: activityDetails(person.id, client),
          });
        }
      });
    },

    /** Sends the verification email again (the newest link replaces older ones). Does nothing if already verified. */
    async resendVerificationEmail(principal: Principal): Promise<void> {
      const person = await repository.findPersonById(database.system, principal.userId);
      if (!person || person.emailVerified) return;
      const secret = await database.runInSystemTransaction((transaction) =>
        createEmailLink(transaction, person.id, 'email_verify', EMAIL_LINK_HOURS),
      );
      const profile = await database.runInAccountTransaction(person.accountId, (transaction) =>
        repository.findProfile(transaction, person.id),
      );
      await sendMailSafely(
        buildVerificationEmail({
          to: person.email,
          name: person.name,
          businessName: profile?.businessName ?? 'your business',
          link: verificationLink(secret),
        }),
      );
    },

    /**
     * Checks the email and password and opens a session. A wrong email, a wrong password, a disabled person and a
     * locked email all look the same to the caller, and take about the same time.
     */
    async signIn(
      email: string,
      password: string,
      client: ClientInfo,
    ): Promise<{ tokens: IssuedTokens; profile: ProfileResponse }> {
      const attemptKey = hashSecret(`login:${email}`);
      if (await repository.findLockedUntil(database.system, attemptKey)) throw loginLocked();

      const candidate = await repository.findLoginCandidateByEmail(database.system, email);
      // An unknown email is checked against a dummy hash, so it takes as long as a wrong password
      const passwordIsRight = await passwordMatches(candidate?.passwordHash ?? (await NO_SUCH_USER_HASH), password);
      if (!candidate || candidate.status !== 'active' || !passwordIsRight) {
        await repository.recordFailedLogin(database.system, attemptKey, {
          maxFailures: MAX_FAILED_LOGINS,
          lockMinutes: LOCK_MINUTES,
        });
        throw invalidCredentials();
      }

      const session = await database.runInSystemTransaction(async (transaction) => {
        await repository.clearLoginAttempts(transaction, attemptKey);
        await repository.markLoggedIn(transaction, candidate.id);
        return startSession(transaction, candidate.id, client);
      });
      await auditInFence(candidate.accountId, candidate.id, 'auth.signed_in', client);
      const profile = await database.runInAccountTransaction(candidate.accountId, (transaction) =>
        repository.findProfile(transaction, candidate.id),
      );
      if (!profile) throw sessionEnded();
      return {
        tokens: { accessToken: await signAccess(candidate.id, session.sessionId), refreshToken: session.refreshToken },
        profile: toProfileResponse(profile),
      };
    },

    /**
     * Swaps a refresh token for a new access token and a new refresh token. A token that was just replaced (two requests
     * refreshing at once) gets an access token only; a replaced token used again later means a copy was stolen, so the
     * whole session ends.
     */
    async refresh(refreshToken: string): Promise<IssuedTokens> {
      const presentedHash = hashSecret(refreshToken);
      const session = await repository.findSessionForRefresh(database.system, presentedHash, {
        idleDays: config.auth.sessionIdleDays,
        graceSeconds: REFRESH_GRACE_SECONDS,
      });
      if (!session || !session.isLive) throw sessionEnded();

      if (session.matched === 'previous') {
        if (session.rotatedWithinGraceSeconds) return { accessToken: await signAccess(session.userId, session.id) };
        await repository.revokeSession(database.system, session.id, 'a replaced refresh token was used again');
        logger.warn({ sessionId: session.id }, 'a replaced refresh token was reused: session ended');
        throw sessionEnded();
      }

      const newRefreshToken = generateSecret();
      const rotated = await repository.rotateRefreshToken(
        database.system,
        session.id,
        presentedHash,
        hashSecret(newRefreshToken),
      );
      const accessToken = await signAccess(session.userId, session.id);
      // If another request replaced the token a moment ago, the browser already has the new one
      return rotated ? { accessToken, refreshToken: newRefreshToken } : { accessToken };
    },

    /** Ends the session the person is using. */
    async signOut(principal: Principal, client: ClientInfo): Promise<void> {
      await repository.revokeSession(database.system, principal.sessionId, 'signed out');
      await auditInFence(principal.accountId, principal.userId, 'auth.signed_out', client);
    },

    /** Emails a reset link if the email belongs to someone. Says nothing either way. */
    async requestPasswordReset(email: string): Promise<void> {
      const person = await repository.findPersonByEmail(database.system, email);
      if (!person || person.status !== 'active') return;
      const secret = await database.runInSystemTransaction((transaction) =>
        createEmailLink(transaction, person.id, 'password_reset', RESET_LINK_HOURS),
      );
      await sendMailSafely(buildPasswordResetEmail({ to: person.email, name: person.name, link: resetLink(secret) }));
    },

    /** Sets a new password from an emailed link. Ends every session of that person. */
    async resetPassword(secret: string, newPassword: string, client: ClientInfo): Promise<void> {
      const link = await repository.findUsableAuthToken(database.system, 'password_reset', hashSecret(secret));
      if (!link) throw invalidLink();
      const person = await repository.findPersonById(database.system, link.userId);
      if (!person) throw invalidLink();
      const problem = findPasswordProblem(newPassword, { email: person.email, mobileDigits: person.mobileDigits });
      if (problem) throw new ApiError(400, 'WEAK_PASSWORD', problem);
      const passwordHash = await hashPassword(newPassword);
      await database.runInSystemTransaction(async (transaction) => {
        if (!(await repository.useAuthToken(transaction, link.id))) throw invalidLink();
        await repository.setPasswordHash(transaction, person.id, passwordHash);
        await repository.revokeSessionsOfUser(transaction, person.id, 'password reset', null);
        await repository.markEmailVerified(transaction, person.id); // they proved they own the address by opening the link
        await repository.clearLoginAttempts(transaction, hashSecret(`login:${person.email}`));
        await writeActivityLog(transaction, {
          accountId: person.accountId,
          actor: { kind: 'user', id: person.id },
          kind: 'auth.password_reset',
          details: activityDetails(person.id, client),
        });
      });
    },

    /** Changes the signed-in person's password after checking the current one. Their other sessions end. */
    async changePassword(
      principal: Principal,
      currentPassword: string,
      newPassword: string,
      client: ClientInfo,
    ): Promise<void> {
      const storedHash = await repository.findPasswordHash(database.system, principal.userId);
      if (!storedHash || !(await passwordMatches(storedHash, currentPassword))) {
        throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is not right.');
      }
      if (currentPassword === newPassword) throw badRequest('Choose a password different from the current one.');
      const person = await repository.findPersonById(database.system, principal.userId);
      if (!person) throw sessionEnded();
      const problem = findPasswordProblem(newPassword, { email: person.email, mobileDigits: person.mobileDigits });
      if (problem) throw new ApiError(400, 'WEAK_PASSWORD', problem);
      const passwordHash = await hashPassword(newPassword);
      await database.runInSystemTransaction(async (transaction) => {
        await repository.setPasswordHash(transaction, principal.userId, passwordHash);
        await repository.revokeSessionsOfUser(transaction, principal.userId, 'password changed', principal.sessionId);
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: 'auth.password_changed',
          details: activityDetails(principal.userId, client),
        });
      });
    },

    /** The signed-in person and their business, read inside the business's fence. */
    async getProfile(requestContext: RequestContext): Promise<ProfileResponse> {
      const profile = await requestContext.runInAccountTransaction((transaction) =>
        repository.findProfile(transaction, requestContext.user.id),
      );
      if (!profile) throw notFound('Your account');
      return toProfileResponse(profile);
    },

    /** Changes the signed-in person's name. */
    async updateName(requestContext: RequestContext, name: string): Promise<ProfileResponse> {
      await requestContext.runInAccountTransaction(async (transaction) => {
        await repository.updateUserName(transaction, requestContext.user.id, name, requestContext.actor);
        await requestContext.audit(transaction, 'auth.name_changed', {
          recordType: 'user',
          recordId: requestContext.user.id,
          fields: ['name'],
        });
      });
      return this.getProfile(requestContext);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

/** Shapes a profile row into the answer the API gives. */
function toProfileResponse(profile: repository.ProfileRow): ProfileResponse {
  return {
    user: {
      id: profile.userId,
      name: profile.name,
      email: profile.email,
      mobile: profile.mobile,
      role: profile.role,
      emailVerified: profile.emailVerified,
    },
    business: {
      id: profile.businessId,
      name: profile.businessName,
      industry: profile.industry,
      timeZone: profile.timeZone,
    },
  };
}
