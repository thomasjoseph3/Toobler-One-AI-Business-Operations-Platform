import type { FastifyBaseLogger } from 'fastify';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import { uuidv7 } from '../../../../kernel/ids';
import type { MailSender } from '../../../../providers/mail';
import { buildResetPasswordEmail } from '../helpers/reset-password-email';
import { findPasswordProblem, hashPassword } from '../helpers/passwords';
import { generateSecret, hashSecret } from '../helpers/tokens';
import * as authTokensRepository from '../repositories/auth-tokens.repository';
import * as credentialsRepository from '../repositories/credentials.repository';
import * as loginAttemptsRepository from '../repositories/login-attempts.repository';
import * as sessionsRepository from '../repositories/sessions.repository';
import * as usersRepository from '../repositories/users.repository';

/** How long an emailed reset link works. Shorter than the verification link: it opens the door to the account. */
export const RESET_LINK_HOURS = 1;

/** The one answer for every reset link that cannot be used, so nothing reveals which rule failed. */
const invalidLink = () =>
  new ApiError(400, 'INVALID_TOKEN', 'This link is not valid any more. Ask for a new email and try again.');

/**
 * Everything about forgetting a password: sending the reset link, and using it to choose a new password.
 * Repositories used: auth-tokens, users, credentials, sessions, login-attempts (all in ../repositories).
 */
export function createPasswordResetService({
  config,
  database,
  mail,
  logger,
}: {
  config: Config;
  database: Database;
  mail: MailSender;
  logger: FastifyBaseLogger;
}) {
  return {
    /**
     * Emails a reset link to this address, if an active person has it. It returns the same way when there is nobody, so
     * the caller cannot tell the difference. A failure to send is logged (never with the address or the link) and
     * swallowed for the same reason: the answer must not depend on whether the account exists.
     */
    async sendResetLink(email: string): Promise<void> {
      try {
        const rawToken = generateSecret();
        const person = await database.runInSystemTransaction(async (transaction) => {
          const found = await usersRepository.findPersonByEmail(transaction, email);
          if (!found || found.status !== 'active') return undefined;
          // Only the newest link works
          await authTokensRepository.deleteUnusedAuthTokens(transaction, found.id, 'reset_password');
          await authTokensRepository.insertAuthToken(transaction, {
            id: uuidv7(),
            userId: found.id,
            purpose: 'reset_password',
            tokenHash: hashSecret(rawToken),
            hours: RESET_LINK_HOURS,
          });
          return found;
        });
        if (!person) return;
        // The link opens a page in the web app; that page sends the token to POST /auth/reset-password. The link itself
        // changes nothing, so an email scanner that opens it does no harm.
        const link = `${config.webUrl}/reset-password?token=${rawToken}`;
        await mail.send(buildResetPasswordEmail(person, link, RESET_LINK_HOURS));
      } catch (error) {
        logger.error({ reason: error instanceof Error ? error.name : 'unknown' }, 'could not send the reset email');
      }
    },

    /**
     * Uses a reset link to set a new password. In ONE transaction: uses up the link, checks the new password, saves it,
     * ends every session of the person (on every device), forgets their wrong-password count, and records it in the
     * activity log. If the new password is refused the whole transaction is undone, so the link still works for another
     * try. The person is not signed in afterwards; they sign in with the new password.
     */
    async resetPassword(token: string, newPassword: string): Promise<void> {
      await database.runInSystemTransaction(async (transaction) => {
        const usedLink = await authTokensRepository.useAuthToken(transaction, hashSecret(token), 'reset_password');
        if (!usedLink) throw invalidLink();
        const person = await usersRepository.findPersonById(transaction, usedLink.userId);
        // A person disabled after asking for the link can no longer use it
        if (!person || person.status !== 'active') throw invalidLink();

        const passwordProblem = findPasswordProblem(newPassword, {
          email: person.email,
          mobileDigits: person.mobile ? person.mobile.replace(/\D/g, '') : null,
        });
        if (passwordProblem) throw new ApiError(400, 'WEAK_PASSWORD', passwordProblem);

        await credentialsRepository.setPasswordHash(transaction, person.id, await hashPassword(newPassword));
        await sessionsRepository.revokeAllSessionsForUser(transaction, person.id, 'password reset');
        await loginAttemptsRepository.clearFailures(transaction, person.email);
        // They proved they own this address by opening the link we emailed, so it also counts as verified
        await usersRepository.markEmailVerified(transaction, person.id);
        await writeActivityLog(transaction, {
          accountId: person.accountId,
          actor: { kind: 'user', id: person.id },
          kind: 'auth.password_reset',
          details: { recordType: 'user', recordId: person.id },
        });
      });
    },
  };
}

export type PasswordResetService = ReturnType<typeof createPasswordResetService>;
